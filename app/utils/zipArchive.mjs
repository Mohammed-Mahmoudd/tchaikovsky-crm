// Zero-dependency PKZIP archive builder (DEFLATE via native CompressionStream with STORE fallback).

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

const TEXT_ENCODER = new TextEncoder();

/** Computes IEEE 802.3 CRC-32 checksum for a byte buffer. */
export function computeCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Ensures every ZIP entry filename is unique while preserving file extensions. */
export function deduplicateArchiveFilenames(rawNames) {
  const used = new Map();
  return rawNames.map((raw) => {
    const clean = String(raw || "file.txt").replace(/^[\\/]+/, "") || "file.txt";
    const key = clean.toLowerCase();
    const count = used.get(key) ?? 0;
    used.set(key, count + 1);
    if (count === 0) return clean;

    const dotIdx = clean.lastIndexOf(".");
    if (dotIdx > 0) {
      const stem = clean.slice(0, dotIdx);
      const ext = clean.slice(dotIdx);
      let candidate = `${stem}-${count + 1}${ext}`;
      while (used.has(candidate.toLowerCase())) {
        const nextNum = (used.get(key) ?? count + 1) + 1;
        used.set(key, nextNum);
        candidate = `${stem}-${nextNum}${ext}`;
      }
      used.set(candidate.toLowerCase(), 1);
      return candidate;
    }
    let candidate = `${clean}-${count + 1}`;
    while (used.has(candidate.toLowerCase())) {
      const nextNum = (used.get(key) ?? count + 1) + 1;
      used.set(key, nextNum);
      candidate = `${clean}-${nextNum}`;
    }
    used.set(candidate.toLowerCase(), 1);
    return candidate;
  });
}

function toDosDateTime(date) {
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = Math.max(1980, Math.min(2107, valid.getFullYear()));
  const month = valid.getMonth() + 1;
  const day = valid.getDate();
  const hours = valid.getHours();
  const minutes = valid.getMinutes();
  const seconds = Math.floor(valid.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

function encodeEntryBytes(content) {
  if (typeof content === "string") {
    return TEXT_ENCODER.encode(content);
  }
  return content;
}

async function tryDeflateRaw(input) {
  if (typeof CompressionStream === "undefined" || input.length < 64) {
    return null;
  }
  try {
    const stream = new CompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    const copy = new Uint8Array(input.length);
    copy.set(input);
    const writePromise = writer.write(copy).then(() => writer.close());
    const reader = stream.readable.getReader();
    const chunks = [];
    let totalLen = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        chunks.push(value);
        totalLen += value.length;
      }
    }
    await writePromise;
    if (totalLen >= input.length) return null;
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  } catch {
    return null;
  }
}

function assembleZipBytes(records) {
  let localTotal = 0;
  let centralTotal = 0;
  for (const r of records) {
    localTotal += 30 + r.nameBytes.length + r.compressedBytes.length;
    centralTotal += 46 + r.nameBytes.length;
  }

  const totalSize = localTotal + centralTotal + 22;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  const offsets = [];
  let cursor = 0;

  for (const r of records) {
    offsets.push(cursor);
    view.setUint32(cursor, 0x04034b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(cursor + 8, r.method, true); // 0 = STORE, 8 = DEFLATE
    view.setUint16(cursor + 10, r.dosTime, true);
    view.setUint16(cursor + 12, r.dosDate, true);
    view.setUint32(cursor + 14, r.crc32, true);
    view.setUint32(cursor + 18, r.compressedBytes.length, true);
    view.setUint32(cursor + 22, r.uncompressedSize, true);
    view.setUint16(cursor + 26, r.nameBytes.length, true);
    view.setUint16(cursor + 28, 0, true);
    cursor += 30;

    out.set(r.nameBytes, cursor);
    cursor += r.nameBytes.length;
    out.set(r.compressedBytes, cursor);
    cursor += r.compressedBytes.length;
  }

  const centralDirOffset = cursor;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    view.setUint32(cursor, 0x02014b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 20, true);
    view.setUint16(cursor + 8, 0x0800, true);
    view.setUint16(cursor + 10, r.method, true);
    view.setUint16(cursor + 12, r.dosTime, true);
    view.setUint16(cursor + 14, r.dosDate, true);
    view.setUint32(cursor + 16, r.crc32, true);
    view.setUint32(cursor + 20, r.compressedBytes.length, true);
    view.setUint32(cursor + 24, r.uncompressedSize, true);
    view.setUint16(cursor + 28, r.nameBytes.length, true);
    view.setUint16(cursor + 30, 0, true);
    view.setUint16(cursor + 32, 0, true);
    view.setUint16(cursor + 34, 0, true);
    view.setUint16(cursor + 36, 0, true);
    view.setUint32(cursor + 38, 0, true);
    view.setUint32(cursor + 42, offsets[i], true);
    cursor += 46;

    out.set(r.nameBytes, cursor);
    cursor += r.nameBytes.length;
  }

  const centralDirSize = cursor - centralDirOffset;

  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, records.length, true);
  view.setUint16(cursor + 10, records.length, true);
  view.setUint32(cursor + 12, centralDirSize, true);
  view.setUint32(cursor + 16, centralDirOffset, true);
  view.setUint16(cursor + 20, 0, true);

  return out;
}

/**
 * Synchronously builds a valid uncompressed (STORE) PKZIP archive without external dependencies.
 */
export function createZipArchiveSync(entries) {
  const uniqueNames = deduplicateArchiveFilenames(entries.map((e) => e.name));
  const records = entries.map((entry, idx) => {
    const rawBytes = encodeEntryBytes(entry.content);
    const { dosTime, dosDate } = toDosDateTime(entry.modifiedAt ?? new Date());
    return {
      nameBytes: TEXT_ENCODER.encode(uniqueNames[idx]),
      compressedBytes: rawBytes,
      uncompressedSize: rawBytes.length,
      crc32: computeCrc32(rawBytes),
      method: 0,
      dosTime,
      dosDate,
    };
  });
  return assembleZipBytes(records);
}

/**
 * Builds a PKZIP archive asynchronously, using native browser deflate compression
 * when supported and falling back cleanly to STORE otherwise.
 */
export async function createZipArchive(entries, options = {}) {
  const compress = options.compress !== false;
  const uniqueNames = deduplicateArchiveFilenames(entries.map((e) => e.name));
  const records = await Promise.all(
    entries.map(async (entry, idx) => {
      const rawBytes = encodeEntryBytes(entry.content);
      const { dosTime, dosDate } = toDosDateTime(entry.modifiedAt ?? new Date());
      const deflated = compress ? await tryDeflateRaw(rawBytes) : null;
      return {
        nameBytes: TEXT_ENCODER.encode(uniqueNames[idx]),
        compressedBytes: deflated ?? rawBytes,
        uncompressedSize: rawBytes.length,
        crc32: computeCrc32(rawBytes),
        method: deflated ? 8 : 0,
        dosTime,
        dosDate,
      };
    })
  );
  return assembleZipBytes(records);
}

/**
 * Triggers a client-side binary file download (such as `.zip`) via a Blob URL.
 */
export function triggerBinaryFileDownload(filename, bytes, mimeType) {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}


import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import {
  computeCrc32,
  createZipArchive,
  createZipArchiveSync,
  deduplicateArchiveFilenames,
} from "./zipArchive.mjs";

function parseZipEntries(zipBytes) {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder("utf-8");

  // Locate EOCD at the end (no comment -> 22 bytes from end)
  const eocdOffset = zipBytes.length - 22;
  assert.equal(view.getUint32(eocdOffset, true), 0x06054b50, "EOCD signature must match");
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const entries = [];
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50, "Central header signature must match");
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(zipBytes.subarray(cursor + 46, cursor + 46 + nameLen));

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, "Local header signature must match");
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const payload = zipBytes.subarray(dataStart, dataStart + compressedSize);
    const raw = method === 8 ? zlib.inflateRawSync(payload) : payload;

    assert.equal(raw.length, uncompressedSize);
    assert.equal(computeCrc32(raw), expectedCrc);

    entries.push({ name, method, text: decoder.decode(raw) });
    cursor += 46 + nameLen;
  }
  return entries;
}

describe("zipArchive", () => {
  it("deduplicates colliding archive entry filenames while preserving extensions", () => {
    assert.deepEqual(
      deduplicateArchiveFilenames([
        "conversation-Sara-2026-11-24.txt",
        "conversation-Sara-2026-11-24.txt",
        "conversation-Sara-2026-11-24.txt",
        "README",
        "README",
      ]),
      [
        "conversation-Sara-2026-11-24.txt",
        "conversation-Sara-2026-11-24-2.txt",
        "conversation-Sara-2026-11-24-3.txt",
        "README",
        "README-2",
      ]
    );
  });

  it("creates valid ZIP archives (sync STORE and async DEFLATE) readable by standard zlib", async () => {
    const longRepeated = "السلام عليكم — تذكرة تعريفية مجانية في مدرسة تشايكوفسكي\n".repeat(20);
    const inputs = [
      { name: "conversation-Layla-2026-11-24.txt", content: longRepeated },
      { name: "conversation-Layla-2026-11-24.txt", content: "Second chat with same name" },
      { name: "أحمد-علي.txt", content: "مرحبا بك" },
    ];

    const syncZip = createZipArchiveSync(inputs);
    const parsedSync = parseZipEntries(syncZip);
    assert.equal(parsedSync.length, 3);
    assert.equal(parsedSync[0].name, "conversation-Layla-2026-11-24.txt");
    assert.equal(parsedSync[0].text, longRepeated);
    assert.equal(parsedSync[1].name, "conversation-Layla-2026-11-24-2.txt");
    assert.equal(parsedSync[1].text, "Second chat with same name");
    assert.equal(parsedSync[2].name, "أحمد-علي.txt");
    assert.equal(parsedSync[2].text, "مرحبا بك");

    const asyncZip = await createZipArchive(inputs, { compress: true });
    const parsedAsync = parseZipEntries(asyncZip);
    assert.equal(parsedAsync.length, 3);
    assert.equal(parsedAsync[0].text, longRepeated);
    assert.equal(parsedAsync[1].text, "Second chat with same name");
    assert.equal(parsedAsync[2].text, "مرحبا بك");
  });
});

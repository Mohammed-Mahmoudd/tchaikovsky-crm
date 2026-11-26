export type DetectedImageFormat =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/avif"
  | "image/heic"
  | "image/bmp"
  | "image/svg+xml"
  | "unknown";

export type ImageUploadTransformPlan =
  | "skip"
  | "compress_keep_smaller"
  | "transcode_required"
  | "document_fallback";

const WHATSAPP_NATIVE_IMAGE_MIMES = new Set<string>(["image/jpeg", "image/png"]);

const AVIF_BRANDS = new Set<string>(["avif", "avis"]);
const HEIC_BRANDS = new Set<string>(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  if (start < 0 || start + length > bytes.length) return "";
  let out = "";
  for (let i = start; i < start + length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Inspect leading file bytes to determine the true image container/codec
 * regardless of file extension or browser-reported MIME type.
 */
export function detectImageFormatFromBytes(bytes: Uint8Array): DetectedImageFormat {
  if (!bytes || bytes.length < 2) return "unknown";

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: GIF87a / GIF89a
  if (bytes.length >= 6) {
    const sig = readAscii(bytes, 0, 6);
    if (sig === "GIF87a" || sig === "GIF89a") {
      return "image/gif";
    }
  }

  // WebP: RIFF....WEBP
  if (bytes.length >= 12 && readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }

  // BMP: BM
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }

  // ISO BMFF (AVIF / HEIC): ....ftyp<brands...>
  if (bytes.length >= 12 && readAscii(bytes, 4, 4) === "ftyp") {
    const majorBrand = readAscii(bytes, 8, 4).toLowerCase();
    if (AVIF_BRANDS.has(majorBrand)) return "image/avif";
    if (HEIC_BRANDS.has(majorBrand)) return "image/heic";

    // Check compatible brands starting at byte 16
    const limit = Math.min(bytes.length, 64);
    for (let offset = 16; offset + 4 <= limit; offset += 4) {
      const compatBrand = readAscii(bytes, offset, 4).toLowerCase();
      if (AVIF_BRANDS.has(compatBrand)) return "image/avif";
      if (HEIC_BRANDS.has(compatBrand)) return "image/heic";
    }
  }

  // SVG: text prefix containing <svg
  const sampleLen = Math.min(bytes.length, 256);
  const headText = readAscii(bytes, 0, sampleLen)
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (headText.startsWith("<svg") || (headText.startsWith("<?xml") && headText.includes("<svg"))) {
    return "image/svg+xml";
  }

  return "unknown";
}

/**
 * Returns true only for formats WhatsApp ImageMessage renders natively across clients.
 */
export function isWhatsAppNativeImageFormat(mimeType: string): boolean {
  return WHATSAPP_NATIVE_IMAGE_MIMES.has((mimeType || "").toLowerCase().trim());
}

/**
 * Replaces the extension of a filename (e.g. "photo.webp" -> "photo.jpg")
 * or appends it cleanly when no extension exists.
 */
export function replaceFileExtension(fileName: string, newExt: string): string {
  const cleanExt = newExt.replace(/^\.+/, "");
  const trimmed = (fileName || "").trim();
  if (!trimmed) return `image.${cleanExt}`;

  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot > lastSlash + 1) {
    return `${trimmed.slice(0, lastDot)}.${cleanExt}`;
  }
  if (lastDot === trimmed.length - 1 && lastDot > lastSlash + 1) {
    return `${trimmed}${cleanExt}`;
  }
  return `${trimmed}.${cleanExt}`;
}

/**
 * Decides how the browser should prepare an image before uploading:
 * - "document_fallback": explicit document mode or SVG
 * - "transcode_required": non-JPEG/PNG (WebP, GIF, AVIF, HEIC, BMP, or disguised bytes) that MUST be transcoded to JPEG even if small
 * - "skip": native JPEG/PNG already small enough to upload untouched
 * - "compress_keep_smaller": large native JPEG/PNG that should be resized/re-encoded if smaller
 */
export function planImageUploadTransform(input: {
  mimeType: string;
  fileSize: number;
  detectedFormat: DetectedImageFormat;
  forceDocument: boolean;
  width?: number;
  height?: number;
}): ImageUploadTransformPlan {
  if (input.forceDocument) return "document_fallback";

  const effectiveMime =
    input.detectedFormat !== "unknown"
      ? input.detectedFormat
      : (input.mimeType || "").toLowerCase().trim();

  if (effectiveMime === "image/svg+xml") {
    return "document_fallback";
  }

  if (!isWhatsAppNativeImageFormat(effectiveMime)) {
    return "transcode_required";
  }

  if (input.fileSize <= 350 * 1024) {
    return "skip";
  }

  if (
    typeof input.width === "number" &&
    typeof input.height === "number" &&
    input.fileSize <= 600 * 1024 &&
    Math.max(input.width, input.height) <= 1920
  ) {
    return "skip";
  }

  return "compress_keep_smaller";
}


import assert from "node:assert/strict";
import test from "node:test";
import {
  detectImageFormatFromBytes,
  isWhatsAppNativeImageFormat,
  planImageUploadTransform,
  replaceFileExtension,
} from "./imageUpload.ts";

function asciiBytes(str) {
  return Array.from(str, (ch) => ch.charCodeAt(0));
}

test("detectImageFormatFromBytes identifies JPEG, PNG, WebP, GIF, AVIF, HEIC, BMP, and SVG", () => {
  assert.equal(
    detectImageFormatFromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])),
    "image/jpeg"
  );
  assert.equal(
    detectImageFormatFromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/png"
  );
  assert.equal(
    detectImageFormatFromBytes(
      new Uint8Array([...asciiBytes("RIFF"), 0x24, 0x00, 0x00, 0x00, ...asciiBytes("WEBP")])
    ),
    "image/webp"
  );
  assert.equal(
    detectImageFormatFromBytes(new Uint8Array([...asciiBytes("GIF89a"), 0x01, 0x00])),
    "image/gif"
  );
  assert.equal(
    detectImageFormatFromBytes(
      new Uint8Array([0x00, 0x00, 0x00, 0x1c, ...asciiBytes("ftypavif"), 0x00, 0x00, 0x00, 0x00])
    ),
    "image/avif"
  );
  assert.equal(
    detectImageFormatFromBytes(
      new Uint8Array([0x00, 0x00, 0x00, 0x18, ...asciiBytes("ftypheic"), 0x00, 0x00, 0x00, 0x00])
    ),
    "image/heic"
  );
  assert.equal(
    detectImageFormatFromBytes(new Uint8Array([0x42, 0x4d, 0x36, 0x00, 0x00, 0x00])),
    "image/bmp"
  );
  assert.equal(
    detectImageFormatFromBytes(new Uint8Array(asciiBytes('  <svg xmlns="http://www.w3.org/2000/svg"></svg>'))),
    "image/svg+xml"
  );
  assert.equal(detectImageFormatFromBytes(new Uint8Array([0x01, 0x02, 0x03, 0x04])), "unknown");
});

test("detectImageFormatFromBytes detects WebP even when renamed to .jpg", () => {
  const disguisedWebp = new Uint8Array([
    ...asciiBytes("RIFF"),
    0xaa,
    0xbb,
    0x00,
    0x00,
    ...asciiBytes("WEBP"),
  ]);
  assert.equal(detectImageFormatFromBytes(disguisedWebp), "image/webp");
  assert.equal(
    planImageUploadTransform({
      mimeType: "image/jpeg",
      fileSize: 90 * 1024,
      detectedFormat: detectImageFormatFromBytes(disguisedWebp),
      forceDocument: false,
    }),
    "transcode_required"
  );
});

test("isWhatsAppNativeImageFormat allows only JPEG and PNG", () => {
  assert.equal(isWhatsAppNativeImageFormat("image/jpeg"), true);
  assert.equal(isWhatsAppNativeImageFormat("IMAGE/PNG"), true);
  assert.equal(isWhatsAppNativeImageFormat("image/webp"), false);
  assert.equal(isWhatsAppNativeImageFormat("image/avif"), false);
  assert.equal(isWhatsAppNativeImageFormat("image/gif"), false);
  assert.equal(isWhatsAppNativeImageFormat("image/heic"), false);
});

test("planImageUploadTransform forces transcode for small WebP/AVIF/GIF and skips small native JPEG/PNG", () => {
  for (const format of ["image/webp", "image/avif", "image/gif", "image/heic", "image/bmp"]) {
    assert.equal(
      planImageUploadTransform({
        mimeType: format,
        fileSize: 80 * 1024,
        detectedFormat: format,
        forceDocument: false,
      }),
      "transcode_required"
    );
  }

  assert.equal(
    planImageUploadTransform({
      mimeType: "image/jpeg",
      fileSize: 120 * 1024,
      detectedFormat: "image/jpeg",
      forceDocument: false,
    }),
    "skip"
  );

  assert.equal(
    planImageUploadTransform({
      mimeType: "image/png",
      fileSize: 500 * 1024,
      detectedFormat: "image/png",
      forceDocument: false,
      width: 1280,
      height: 720,
    }),
    "skip"
  );

  assert.equal(
    planImageUploadTransform({
      mimeType: "image/png",
      fileSize: 2 * 1024 * 1024,
      detectedFormat: "image/png",
      forceDocument: false,
      width: 2400,
      height: 1600,
    }),
    "compress_keep_smaller"
  );

  assert.equal(
    planImageUploadTransform({
      mimeType: "image/webp",
      fileSize: 80 * 1024,
      detectedFormat: "image/webp",
      forceDocument: true,
    }),
    "document_fallback"
  );
});

test("replaceFileExtension swaps extensions cleanly", () => {
  assert.equal(replaceFileExtension("wannacry.webp", "jpg"), "wannacry.jpg");
  assert.equal(replaceFileExtension("photo.avif", ".jpg"), "photo.jpg");
  assert.equal(replaceFileExtension("clipboard-image", "jpg"), "clipboard-image.jpg");
});

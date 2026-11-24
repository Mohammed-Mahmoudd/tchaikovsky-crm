export interface ZipArchiveEntryInput {
  name: string;
  content: string | Uint8Array;
  modifiedAt?: Date;
}

export interface CreateZipOptions {
  /** Use DEFLATE compression via browser CompressionStream when available (default: true). */
  compress?: boolean;
}

/** Computes IEEE 802.3 CRC-32 checksum for a byte buffer. */
export function computeCrc32(bytes: Uint8Array): number;

/** Ensures every ZIP entry filename is unique while preserving file extensions. */
export function deduplicateArchiveFilenames(rawNames: ReadonlyArray<string>): string[];

/** Synchronously builds a valid uncompressed (STORE) PKZIP archive without external dependencies. */
export function createZipArchiveSync(entries: ReadonlyArray<ZipArchiveEntryInput>): Uint8Array;

/** Builds a PKZIP archive asynchronously using native CompressionStream with STORE fallback. */
export function createZipArchive(
  entries: ReadonlyArray<ZipArchiveEntryInput>,
  options?: CreateZipOptions
): Promise<Uint8Array>;

/** Triggers a client-side binary file download (such as `.zip`) via a Blob URL. */
export function triggerBinaryFileDownload(
  filename: string,
  bytes: Uint8Array,
  mimeType: string
): void;


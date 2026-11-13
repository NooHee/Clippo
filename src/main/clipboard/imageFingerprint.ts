import crypto from 'node:crypto';

/** The subset of Electron's clipboard used to fingerprint images (injectable for tests). */
export interface ImageClipboardReader {
  availableFormats(): string[];
  readBuffer(format: string): Buffer;
  readImage(): { isEmpty(): boolean; toBitmap(): Buffer; getSize(): { width: number; height: number } };
}

/**
 * Raw pasteboard formats we can hash without decoding the image.
 * macOS exposes Uniform Type Identifiers, Linux and Windows expose MIME types.
 */
export const RAW_IMAGE_FORMATS: Readonly<Record<string, readonly string[]>> = {
  darwin: ['public.png', 'public.tiff'],
  default: ['image/png'],
};

const SAMPLE_BYTES = 64 * 1024;

export function hasImage(formats: readonly string[]): boolean {
  return formats.some((format) => format.startsWith('image/'));
}

/**
 * Cheap identity for the image currently on the clipboard, or null if there is none.
 *
 * The previous poller decoded the image and re-encoded it to PNG every 500 ms just to compare
 * hashes (about 250 ms of main-thread work per tick for a Retina screenshot). Here we hash the
 * raw encoded bytes the pasteboard already holds: their length plus the first and last 64 KB.
 * For PNG this is a sound identity check because the end of the zlib stream carries an Adler-32
 * checksum of every pixel, so any pixel change also changes the tail. Decoding only happens as
 * a fallback when no raw format is available.
 */
export function fingerprintClipboardImage(
  reader: ImageClipboardReader,
  platform: string = process.platform,
): string | null {
  if (!hasImage(reader.availableFormats())) return null;

  const rawFormats = RAW_IMAGE_FORMATS[platform] ?? RAW_IMAGE_FORMATS.default;
  for (const format of rawFormats) {
    const raw = reader.readBuffer(format);
    if (raw.length === 0) continue;
    const prefix = `${format}:${raw.length}`;
    return isPng(format) ? hash(prefix, raw, 'sampled') : hash(prefix, raw, 'full');
  }

  const image = reader.readImage();
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  return hash(`bitmap:${width}x${height}`, image.toBitmap(), 'full');
}

function isPng(format: string): boolean {
  return format === 'public.png' || format === 'image/png';
}

/** `sampled` is only safe for formats that embed a checksum of the whole payload near the end. */
function hash(prefix: string, bytes: Buffer, mode: 'sampled' | 'full'): string {
  const digest = crypto.createHash('sha1').update(prefix);
  if (mode === 'full' || bytes.length <= SAMPLE_BYTES * 2) {
    digest.update(bytes);
  } else {
    digest.update(bytes.subarray(0, SAMPLE_BYTES)).update(bytes.subarray(bytes.length - SAMPLE_BYTES));
  }
  return digest.digest('hex');
}

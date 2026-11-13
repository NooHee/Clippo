import { describe, expect, it } from 'vitest';
import { fingerprintClipboardImage, type ImageClipboardReader } from './imageFingerprint';

class FakeClipboard implements ImageClipboardReader {
  decodeCount = 0;

  constructor(
    private readonly formats: string[],
    private readonly buffers: Record<string, Buffer> = {},
    private readonly bitmap: Buffer = Buffer.alloc(0),
  ) {}

  availableFormats(): string[] {
    return this.formats;
  }

  readBuffer(format: string): Buffer {
    return this.buffers[format] ?? Buffer.alloc(0);
  }

  readImage() {
    this.decodeCount++;
    const bitmap = this.bitmap;
    return {
      isEmpty: () => bitmap.length === 0,
      toBitmap: () => bitmap,
      getSize: () => ({ width: 2, height: bitmap.length / 8 }),
    };
  }
}

const big = (fill: number, size = 300_000) => Buffer.alloc(size, fill);

describe('fingerprintClipboardImage', () => {
  it('returns null when the clipboard holds no image', () => {
    expect(fingerprintClipboardImage(new FakeClipboard(['text/plain']), 'darwin')).toBeNull();
  });

  it('hashes the raw PNG bytes without decoding the image', () => {
    const clipboard = new FakeClipboard(['image/png'], { 'public.png': big(1) });

    expect(fingerprintClipboardImage(clipboard, 'darwin')).toMatch(/^[0-9a-f]{40}$/);
    expect(clipboard.decodeCount).toBe(0);
  });

  it('is stable for the same image and changes when the PNG tail (zlib checksum) changes', () => {
    const png = big(1);
    const edited = Buffer.from(png);
    edited[edited.length - 10] = 9;

    const first = fingerprintClipboardImage(new FakeClipboard(['image/png'], { 'image/png': png }), 'linux');
    const same = fingerprintClipboardImage(new FakeClipboard(['image/png'], { 'image/png': Buffer.from(png) }), 'linux');
    const changed = fingerprintClipboardImage(new FakeClipboard(['image/png'], { 'image/png': edited }), 'linux');

    expect(same).toBe(first);
    expect(changed).not.toBe(first);
  });

  it('hashes non-PNG formats in full, because they carry no trailing checksum', () => {
    const tiff = big(1);
    const editedInTheMiddle = Buffer.from(tiff);
    editedInTheMiddle[150_000] = 9;

    const reader = (bytes: Buffer) => new FakeClipboard(['image/tiff'], { 'public.tiff': bytes });
    expect(fingerprintClipboardImage(reader(tiff), 'darwin')).not.toBe(
      fingerprintClipboardImage(reader(editedInTheMiddle), 'darwin'),
    );
  });

  it('falls back to decoding when no raw format is available', () => {
    const clipboard = new FakeClipboard(['image/bmp'], {}, big(3, 64));

    expect(fingerprintClipboardImage(clipboard, 'darwin')).not.toBeNull();
    expect(clipboard.decodeCount).toBe(1);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { nativeImage, type NativeImage } from 'electron';

/**
 * Thumbnails are shown at about 350x140 CSS pixels, so 640px wide covers Retina screens.
 * The previous implementation "generated" thumbnails by copying the full-size file and then
 * sent it base64-encoded over IPC every time a row mounted, which made opening the popup
 * slow as soon as the history contained a few screenshots.
 */
const THUMBNAIL_WIDTH = 640;
/** Versioned prefix so thumbnails written by older builds (full-size copies) are regenerated once. */
const THUMBNAIL_PREFIX = 'thumb_v2_';
const SAFE_IMAGE_NAME = /^[\w.-]+\.png$/;

export class ImageStore {
  private readonly thumbnailsDir: string;

  constructor(private readonly imagesDir: string) {
    this.thumbnailsDir = path.join(imagesDir, 'thumbnails');
  }

  /** Saves the image and its thumbnail, returning the file name stored in history. */
  save(image: NativeImage, fingerprint: string): string {
    fs.mkdirSync(this.thumbnailsDir, { recursive: true });
    const imageName = `${Date.now()}_${fingerprint.slice(0, 12)}.png`;
    fs.writeFileSync(this.imagePath(imageName), image.toPNG());
    this.writeThumbnail(imageName, image);
    return imageName;
  }

  /** Returns a small data URL for the renderer, generating the thumbnail on demand if needed. */
  thumbnailDataUrl(imageName: string): string | null {
    if (!SAFE_IMAGE_NAME.test(imageName)) return null;
    const thumbPath = this.thumbnailPath(imageName);
    if (!fs.existsSync(thumbPath)) {
      const original = this.read(imageName);
      if (!original) return null;
      fs.mkdirSync(this.thumbnailsDir, { recursive: true });
      this.writeThumbnail(imageName, original);
    }
    return `data:image/png;base64,${fs.readFileSync(thumbPath).toString('base64')}`;
  }

  read(imageName: string): NativeImage | null {
    if (!SAFE_IMAGE_NAME.test(imageName)) return null;
    const imagePath = this.imagePath(imageName);
    if (!fs.existsSync(imagePath)) return null;
    const image = nativeImage.createFromPath(imagePath);
    return image.isEmpty() ? null : image;
  }

  delete(imageName: string): void {
    if (!SAFE_IMAGE_NAME.test(imageName)) return;
    for (const file of [
      this.imagePath(imageName),
      this.thumbnailPath(imageName),
      path.join(this.thumbnailsDir, `thumb_${imageName}`), // legacy thumbnail name
    ]) {
      fs.rmSync(file, { force: true });
    }
  }

  private writeThumbnail(imageName: string, image: NativeImage): void {
    const { width } = image.getSize();
    const thumbnail = width > THUMBNAIL_WIDTH ? image.resize({ width: THUMBNAIL_WIDTH, quality: 'good' }) : image;
    fs.writeFileSync(this.thumbnailPath(imageName), thumbnail.toPNG());
  }

  private imagePath(imageName: string): string {
    return path.join(this.imagesDir, imageName);
  }

  private thumbnailPath(imageName: string): string {
    return path.join(this.thumbnailsDir, `${THUMBNAIL_PREFIX}${imageName}`);
  }
}

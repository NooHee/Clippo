import fs from 'node:fs';
import path from 'node:path';
import { nativeImage, type NativeImage } from 'electron';

/**
 * Thumbnails are shown at about 350x140 CSS pixels, so 640px wide covers Retina screens.
 * They reach the renderer through the `clippo-image://` protocol (see imageProtocol.ts): the
 * popup uses a plain <img src>, and Chromium reads, decodes and caches the file. Earlier
 * versions read each thumbnail synchronously on the main thread and sent it base64 encoded
 * over IPC every time a row mounted.
 */
const THUMBNAIL_WIDTH = 640;
/** Versioned prefix so thumbnails written by older builds (full-size copies) are regenerated once. */
const THUMBNAIL_PREFIX = 'thumb_v2_';
const SAFE_IMAGE_NAME = /^[\w.-]+\.png$/;

export function isSafeImageName(imageName: string): boolean {
  return SAFE_IMAGE_NAME.test(imageName);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

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

  /**
   * Absolute path of the thumbnail, generating it first if an older build never wrote one.
   * Resolves to null for unknown or unsafe names, so a crafted URL can never escape the folder.
   */
  async thumbnailFile(imageName: string): Promise<string | null> {
    if (!isSafeImageName(imageName)) return null;
    const thumbPath = this.thumbnailPath(imageName);
    if (await fileExists(thumbPath)) return thumbPath;

    const original = this.read(imageName);
    if (!original) return null;
    await fs.promises.mkdir(this.thumbnailsDir, { recursive: true });
    this.writeThumbnail(imageName, original);
    return thumbPath;
  }

  read(imageName: string): NativeImage | null {
    if (!isSafeImageName(imageName)) return null;
    const imagePath = this.imagePath(imageName);
    if (!fs.existsSync(imagePath)) return null;
    const image = nativeImage.createFromPath(imagePath);
    return image.isEmpty() ? null : image;
  }

  delete(imageName: string): void {
    if (!isSafeImageName(imageName)) return;
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

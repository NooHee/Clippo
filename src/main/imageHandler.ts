import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { clipboard } from 'electron';
import crypto from 'crypto';

const IMAGES_DIR = path.join(app.getPath('userData'), 'images');
const THUMBNAILS_DIR = path.join(IMAGES_DIR, 'thumbnails');
const THUMBNAIL_SIZE = 120;

// Ensure image directories exist
export function ensureImageDirs(): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

export function getImagePath(imageName: string): string {
  return path.join(IMAGES_DIR, imageName);
}

export function getThumbnailPath(imageName: string): string {
  return path.join(THUMBNAILS_DIR, `thumb_${imageName}`);
}

/**
 * Save clipboard image to disk
 * Returns { imagePath, mimeType } or null if no image in clipboard
 */
export function saveClipboardImage(): { imagePath: string; imageName: string; mimeType: string } | null {
  try {
    ensureImageDirs();

    const image = clipboard.readImage();
    if (image.isEmpty()) return null;

    const png = image.toPNG();
    const hash = crypto.createHash('md5').update(png).digest('hex').slice(0, 12);
    const timestamp = Date.now();
    const imageName = `${timestamp}_${hash}.png`;
    const imagePath = getImagePath(imageName);

    // Don't save duplicate images
    if (fs.existsSync(imagePath)) {
      return { imagePath, imageName, mimeType: 'image/png' };
    }

    fs.writeFileSync(imagePath, png);

    // Generate thumbnail
    try {
      generateThumbnail(imageName, image);
    } catch (e) {
      console.warn('[ClipStack] Failed to generate thumbnail:', e);
    }

    return { imagePath, imageName, mimeType: 'image/png' };
  } catch (e) {
    console.error('[ClipStack] Failed to save clipboard image:', e);
    return null;
  }
}

function generateThumbnail(imageName: string, image: any): void {
  // Create a simple canvas-based thumbnail
  // For now, we'll just save a smaller version by resizing the image
  const thumbPath = getThumbnailPath(imageName);

  // For simplicity, we'll use the full image as the thumbnail
  // In production, you'd want to use a proper image library like 'sharp' or 'jimp'
  // to create actual thumbnails. For now, we just copy the full image.
  const fullPath = getImagePath(imageName);
  if (fs.existsSync(fullPath)) {
    fs.copyFileSync(fullPath, thumbPath);
  }
}

/**
 * Delete image file and its thumbnail
 */
export function deleteImage(imageName: string): void {
  try {
    const imagePath = getImagePath(imageName);
    const thumbPath = getThumbnailPath(imageName);

    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }
  } catch (e) {
    console.warn('[ClipStack] Failed to delete image:', e);
  }
}

/**
 * Check if image file exists
 */
export function imageExists(imageName: string): boolean {
  return fs.existsSync(getImagePath(imageName));
}

/**
 * Get thumbnail file path (returns full image if thumbnail not available)
 */
export function getImageDisplayPath(imageName: string): string {
  const thumbPath = getThumbnailPath(imageName);
  if (fs.existsSync(thumbPath)) {
    return thumbPath;
  }
  return getImagePath(imageName);
}

/**
 * Paste image back to clipboard
 */
export function pasteImageToClipboard(imageName: string): boolean {
  try {
    const imagePath = getImagePath(imageName);
    if (!fs.existsSync(imagePath)) return false;

    const imageData = fs.readFileSync(imagePath);
    const nativeImage = require('electron').nativeImage.createFromBuffer(imageData);
    clipboard.writeImage(nativeImage);
    return true;
  } catch (e) {
    console.error('[ClipStack] Failed to paste image to clipboard:', e);
    return false;
  }
}

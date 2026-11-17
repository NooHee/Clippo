/**
 * Custom URL scheme that serves image thumbnails to the popup (see main/clipboard/imageProtocol.ts).
 * Building and parsing live side by side so the renderer and the main process can never disagree
 * on the format.
 */
export const IMAGE_PROTOCOL = 'clippo-image';
const THUMBNAIL_HOST = 'thumbnail';

export function thumbnailUrl(imageName: string): string {
  return `${IMAGE_PROTOCOL}://${THUMBNAIL_HOST}/${encodeURIComponent(imageName)}`;
}

/** Extracts the image name from `clippo-image://thumbnail/<name>`, or null for any other URL. */
export function parseThumbnailUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${IMAGE_PROTOCOL}:` || parsed.hostname !== THUMBNAIL_HOST) return null;
    const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return name.length > 0 ? name : null;
  } catch {
    return null; // Not a URL, or a malformed percent escape.
  }
}

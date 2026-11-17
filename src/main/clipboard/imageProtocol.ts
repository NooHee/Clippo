import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { IMAGE_PROTOCOL, parseThumbnailUrl } from '../../shared/thumbnailUrl';
import type { ImageStore } from './imageStore';

/**
 * Must run before the app is ready. "standard" gives the scheme normal URL parsing (host and
 * path), and "secure" lets it load in a page served over https or a custom scheme without
 * mixed content warnings. No other privilege (fetch, CORS, service workers) is granted.
 */
export function registerImageSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: IMAGE_PROTOCOL, privileges: { standard: true, secure: true } }]);
}

/**
 * Serves thumbnails to the popup with `<img src="clippo-image://thumbnail/NAME">`.
 *
 * The main process only resolves a file path (async, validated by ImageStore). `net.fetch`
 * then streams the file through Chromium's network stack, which also decodes and caches the
 * image, so a row that remounts does not cost the main process anything.
 */
export function handleImageProtocol(images: Pick<ImageStore, 'thumbnailFile'>): void {
  protocol.handle(IMAGE_PROTOCOL, async (request) => {
    const imageName = parseThumbnailUrl(request.url);
    const filePath = imageName ? await images.thumbnailFile(imageName) : null;
    if (!filePath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

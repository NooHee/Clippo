import type { Session, WebContents } from 'electron';

/**
 * Hardening for every window Clippo creates (Electron security checklist, items 4, 13 and 14).
 *
 * Clippo windows only ever show the bundled UI. Without these guards, dropping a file or a link
 * onto the popup makes Chromium navigate the window to it, and the preload script runs again on
 * the new page, so untrusted content would get `window.clipstack` (read history, paste).
 */
export function lockNavigation(contents: WebContents): void {
  // Fired for renderer-initiated navigations in the main frame and in subframes (drops, links,
  // location changes). Navigations started by the main process (loadFile, loadURL) do not fire it.
  contents.on('will-frame-navigate', (event) => event.preventDefault());
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** The UI never needs camera, microphone, geolocation, notifications from web content, and so on. */
export function denyWebPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
}

/**
 * True when `frameUrl` is the page Clippo loaded itself (same origin and path, ignoring the query
 * and hash). IPC handlers use it as a second check on top of "which window sent this", so a frame
 * that is not our page is rejected even if it lives inside our window.
 */
export function isAppUrl(frameUrl: string | undefined, appUrl: string): boolean {
  if (!frameUrl) return false;
  try {
    const frame = new URL(frameUrl);
    const app = new URL(appUrl);
    return frame.protocol === app.protocol && frame.host === app.host && frame.pathname === app.pathname;
  } catch {
    return false;
  }
}

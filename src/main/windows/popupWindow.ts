import { once } from 'node:events';
import { app, BrowserWindow, ipcMain, screen, type Rectangle } from 'electron';
import { IPC } from '../../shared/types';
import { perfMark } from '../platform/perf';

/** How long we wait for the renderer to confirm it has painted its reset state before hiding. */
const RESET_ACK_TIMEOUT_MS = 150;
/** A blur caused by our own dialogs or tooltip resolves within this window. */
const BLUR_DISMISS_DELAY_MS = 100;

export interface PopupWindowOptions {
  preloadPath: string;
  /** Dev server URL in development, otherwise undefined and the bundled file is loaded. */
  devServerUrl?: string;
  indexHtmlPath: string;
  popupPosition: () => 'tray' | 'mouse';
  dismissOnBlur: () => boolean;
  trayBounds: () => Rectangle | null;
  onHide?: () => void;
  /** Runs right after the popup is shown, off the critical path of the first frame. */
  onShow?: () => void;
}

/**
 * The single, long-lived popup window.
 *
 * It is created hidden at startup and reused forever, so opening it is just "position + show":
 * no window creation, no page load, no React mount on the hot path.
 */
export class PopupWindow {
  private readonly window: BrowserWindow;
  private hiding: Promise<void> | null = null;

  constructor(private readonly options: PopupWindowOptions) {
    this.window = new BrowserWindow({
      width: 420,
      height: 600,
      minWidth: 300,
      minHeight: 400,
      show: false,
      frame: false,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // A hidden window is throttled by default: timers are delayed and frames are not
        // produced, so the first frame after show() would be stale. The popup must be ready
        // to display instantly, so we opt out.
        backgroundThrottling: false,
        spellcheck: false,
      },
    });

    if (options.devServerUrl) {
      void this.window.loadURL(options.devServerUrl);
      this.window.webContents.openDevTools({ mode: 'detach' });
    } else {
      void this.window.loadFile(options.indexHtmlPath);
    }

    this.window.on('blur', () => this.handleBlur());
    this.window.on('hide', () => options.onHide?.());
  }

  get browserWindow(): BrowserWindow {
    return this.window;
  }

  isVisible(): boolean {
    return this.window.isVisible() && this.hiding === null;
  }

  async show(): Promise<void> {
    if (this.hiding) await this.hiding; // Hotkey pressed again while the hide animation runs.
    const done = perfMark('popup.show');
    if (process.platform === 'darwin') app.show(); // Undo a previous app.hide() focus handback.
    this.position();
    this.window.show();
    this.window.focus();
    done();
    this.options.onShow?.();
  }

  /**
   * Hides without flashing stale content on the next open:
   *  1. make the window fully transparent (it is still composited, so Chromium keeps painting),
   *  2. ask the renderer to reset its UI (search, tabs, panels),
   *  3. wait until the renderer confirms that frame is painted (bounded by a timeout),
   *  4. hide for real and restore opacity.
   *
   * The old version always waited a fixed 80 ms; this one waits only as long as needed and is
   * idempotent, so concurrent callers (blur, Esc, paste) share the same hide.
   */
  hide(): Promise<void> {
    if (!this.window.isVisible()) return Promise.resolve();
    this.hiding ??= this.performHide().finally(() => {
      this.hiding = null;
    });
    return this.hiding;
  }

  toggle(): void {
    if (this.isVisible()) {
      void this.hide();
    } else {
      void this.show();
    }
  }

  private async performHide(): Promise<void> {
    this.window.setOpacity(0);
    const resetDone = once(ipcMain, IPC.POPUP_RESET_DONE, { signal: AbortSignal.timeout(RESET_ACK_TIMEOUT_MS) });
    this.window.webContents.send(IPC.POPUP_WILL_HIDE);
    await resetDone.catch(() => undefined); // Timeout: hide anyway.
    this.window.hide();
    this.window.setOpacity(1);
  }

  private handleBlur(): void {
    if (!this.options.dismissOnBlur()) return;
    setTimeout(() => {
      if (!this.window.isFocused()) void this.hide();
    }, BLUR_DISMISS_DELAY_MS);
  }

  private position(): void {
    const { width, height } = this.window.getBounds();

    if (this.options.popupPosition() === 'mouse') {
      const cursor = screen.getCursorScreenPoint();
      const { x: dx, y: dy, width: dw, height: dh } = screen.getDisplayNearestPoint(cursor).workArea;
      const x = Math.round(Math.max(dx, Math.min(cursor.x - width / 2, dx + dw - width)));
      const y = Math.round(Math.max(dy, Math.min(cursor.y + 12, dy + dh - height)));
      this.window.setPosition(x, y, false);
      return;
    }

    const trayBounds = this.options.trayBounds();
    if (!trayBounds) return;
    const x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);
    this.window.setPosition(x, y, false);
  }
}

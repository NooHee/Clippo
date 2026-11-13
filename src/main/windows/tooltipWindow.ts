import { BrowserWindow, screen } from 'electron';

const TOOLTIP_WIDTH = 420;
const TOOLTIP_MAX_HEIGHT = 460;
const CURSOR_OFFSET_X = 14;

/**
 * Full-text preview shown next to the cursor when hovering a truncated entry.
 *
 * Created lazily on first use: every BrowserWindow is a separate renderer process, and the
 * tooltip used to be created at startup even though most sessions never show it.
 */
export class TooltipWindow {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;

  constructor(private readonly htmlPath: string) {}

  async show(text: string): Promise<void> {
    const window = this.getOrCreate();
    await this.ready;

    const cursor = screen.getCursorScreenPoint();
    const { x: dx, y: dy, width: dw, height: dh } = screen.getDisplayNearestPoint(cursor).workArea;

    // Measure the text inside the tooltip page. JSON.stringify makes the text a safe JS literal.
    const measured: unknown = await window.webContents.executeJavaScript(`
      (() => {
        const el = document.getElementById('wrap');
        el.style.width = '${TOOLTIP_WIDTH}px';
        el.textContent = ${JSON.stringify(text)};
        return Math.min(el.scrollHeight, ${TOOLTIP_MAX_HEIGHT});
      })()
    `);
    const height = typeof measured === 'number' ? Math.ceil(measured) : TOOLTIP_MAX_HEIGHT;

    const fitsRight = dx + dw - (cursor.x + CURSOR_OFFSET_X) >= TOOLTIP_WIDTH;
    const preferredX = fitsRight ? cursor.x + CURSOR_OFFSET_X : cursor.x - TOOLTIP_WIDTH - CURSOR_OFFSET_X;
    const x = Math.max(dx, Math.min(preferredX, dx + dw - TOOLTIP_WIDTH));
    const y = Math.max(dy, Math.min(cursor.y, dy + dh - height));

    window.setBounds({ x: Math.round(x), y: Math.round(y), width: TOOLTIP_WIDTH, height });
    window.showInactive();
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  private getOrCreate(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: TOOLTIP_WIDTH,
      height: 120,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.setIgnoreMouseEvents(true);
    this.ready = window.loadFile(this.htmlPath);
    this.window = window;
    return window;
  }
}

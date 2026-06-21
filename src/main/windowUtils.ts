import { BrowserWindow } from 'electron';
import { execSync } from 'child_process';

let tooltipWindow: BrowserWindow | null = null;
let previousAppName: string | null = null;

export function setTooltipWindow(win: BrowserWindow | null): void {
  tooltipWindow = win;
}

export function setPreviousAppName(name: string | null): void {
  previousAppName = name;
}

export function hideWindowGracefully(win: BrowserWindow, onHidden?: () => void): void {
  if (!win.isVisible()) return;

  if (tooltipWindow) {
    tooltipWindow.hide();
    tooltipWindow.setOpacity(0);
  }

  win.setOpacity(0);
  win.webContents.send('window-will-hide');
  setTimeout(() => {
    win.hide();
    win.setOpacity(1);
    onHidden?.();
  }, 80);
}

export function restoreFocusAndPaste(): void {
  if (previousAppName && previousAppName !== 'Clippy') {
    try {
      const script = `
        activate application "${previousAppName}"
        tell application "System Events" to keystroke "v" using command down
      `;
      execSync(`osascript -e '${script}'`, { timeout: 500 });
    } catch (e) {
      console.error('[Clippy] Failed to restore focus and paste:', e);
    }
  }
}

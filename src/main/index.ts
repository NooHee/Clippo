import { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, screen } from 'electron';
import path from 'path';
import { ClipboardService } from './clipboard';
import { registerIpcHandlers } from './ipc';
import { loadSettings } from './settings';
import { IPC } from '../shared/types';
import type { ClipboardEntry } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let tray: Tray | null = null;
let window: BrowserWindow | null = null;
let tooltipWindow: BrowserWindow | null = null;
let clipboardService: ClipboardService | null = null;

/**
 * Gracefully hide the window:
 * 1. Set opacity to 0 (transparent but still composited — Chromium still paints)
 * 2. Tell renderer to reset state (it re-renders while transparent)
 * 3. After a short delay (enough for React to commit), actually hide + restore opacity
 */
export function hideWindowGracefully(win: BrowserWindow): void {
  //TODO To fix later, the problem is the view is refreshing after opening the popup and not before
  if (!win.isVisible()) return;
  tooltipWindow?.hide();
  win.setOpacity(0);
  win.webContents.send('window-will-hide');
  setTimeout(() => {
    win.hide();
    win.setOpacity(1);
  }, 80);
}

function createTooltipWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 340,
    height: 120,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.setIgnoreMouseEvents(true);
  const htmlPath = isDev
    ? path.join(__dirname, '../../../assets/tooltip.html')
    : path.join(app.getAppPath(), 'assets', 'tooltip.html');
  win.loadFile(htmlPath);
  return win;
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 600,
    minWidth: 300,
    minHeight: 400,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  win.on('blur', () => {
    tooltipWindow?.hide();
    if (!loadSettings().dismissOnBlur) return;
    setTimeout(() => {
      if (!win.isFocused()) hideWindowGracefully(win);
    }, 100);
  });

  win.on('hide', () => {
    tooltipWindow?.hide();
  });

  return win;
}

function createTray(win: BrowserWindow): Tray {
  const iconPath = isDev
    ? path.join(__dirname, '../../../assets/trayTemplate.png')
    : path.join(process.resourcesPath, 'app.asar', 'assets', 'trayTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);
  const t = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ClipStack', click: () => toggleWindow(win) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);

  t.setToolTip('ClipStack');
  t.setContextMenu(contextMenu);
  t.on('click', () => toggleWindow(win));

  return t;
}

function toggleWindow(win: BrowserWindow): void {
  if (win.isVisible()) {
    hideWindowGracefully(win);
    return;
  }
  positionWindow(win);
  win.show();
  win.focus();
}

function positionWindow(win: BrowserWindow): void {
  const { popupPosition } = loadSettings();

  if (popupPosition === 'mouse') {
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { width, height } = win.getBounds();
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

    const x = Math.round(Math.max(dx, Math.min(cursor.x - width / 2, dx + dw - width)));
    const y = Math.round(Math.max(dy, Math.min(cursor.y + 12, dy + dh - height)));
    win.setPosition(x, y, false);
    return;
  }

  // Default: near tray icon
  if (!tray) return;
  const trayBounds = tray.getBounds();
  const windowBounds = win.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 4);
  win.setPosition(x, y, false);
}

function registerShortcuts(win: BrowserWindow, hotkey: string): void {
  globalShortcut.unregisterAll();
  globalShortcut.register(hotkey, () => toggleWindow(win));
}

app.whenReady().then(() => {
  const dockIconPath = isDev
    ? path.join(__dirname, '../../../assets/icon.png')
    : path.join(process.resourcesPath, 'app.asar', 'assets', 'icon.png');
  app.dock.setIcon(dockIconPath);
  app.dock.hide();

  const settings = loadSettings();

  window = createWindow();
  tooltipWindow = createTooltipWindow();
  tray = createTray(window);

  clipboardService = new ClipboardService((entry: ClipboardEntry) => {
    window?.webContents.send(IPC.CLIPBOARD_UPDATED, entry);
  }, settings.pollIntervalMs);

  registerIpcHandlers(window, tooltipWindow, clipboardService, (newSettings) => {
    registerShortcuts(window!, newSettings.hotkey);
  });

  registerShortcuts(window, settings.hotkey);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });

  clipboardService.start();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clipboardService?.stop();
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

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
let clipboardService: ClipboardService | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  win.webContents.openDevTools({ mode: 'detach' });

  win.on('blur', () => {
    if (loadSettings().dismissOnBlur) win.hide();
  });

  win.on('hide', () => {
    win.webContents.send('window-hidden');
  });

  return win;
}

function createTray(win: BrowserWindow): Tray {
  const icon = nativeImage.createEmpty();
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
    win.hide();
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
  app.dock.hide();

  const settings = loadSettings();

  window = createWindow();
  tray = createTray(window);

  clipboardService = new ClipboardService((entry: ClipboardEntry) => {
    window?.webContents.send(IPC.CLIPBOARD_UPDATED, entry);
  }, settings.pollIntervalMs);

  registerIpcHandlers(window, clipboardService, (newSettings) => {
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

import { ipcMain, BrowserWindow, app, dialog, screen } from 'electron';
import fs from 'fs';
import { IPC } from '../shared/types';
import type { Settings } from '../shared/types';
import { getHistory, deleteEntry, togglePin, clearHistory, incrementUsage } from './db';
import { ClipboardService } from './clipboard';
import { loadSettings, saveSettings } from './settings';
import { getGroups, createGroup, deleteGroup, renameGroup, addEntryToGroup, removeEntryFromGroup } from './groups';
import type { ClipboardEntryType } from '../shared/types';
import { hideWindowGracefully } from './index';

export function registerIpcHandlers(
  window: BrowserWindow,
  tooltipWindow: BrowserWindow,
  clipboardService: ClipboardService,
  onSettingsChange: (settings: Settings) => void
): void {
  ipcMain.handle(IPC.GET_HISTORY, (_event, query?: string) => {
    return getHistory(query);
  });

  ipcMain.handle(IPC.SEARCH_HISTORY, (_event, query: string) => {
    return getHistory(query);
  });

  ipcMain.handle(IPC.PASTE_ENTRY, (_event, id: number, content: string) => {
    incrementUsage(id);
    clipboardService.writeToClipboard(content);
    hideWindowGracefully(window);

    // Simulate Cmd+V after the window has fully hidden
    setTimeout(() => simulatePaste(), 230);
  });

  ipcMain.handle(IPC.DELETE_ENTRY, (_event, id: number) => {
    deleteEntry(id);
  });

  ipcMain.handle(IPC.PIN_ENTRY, (_event, id: number) => {
    togglePin(id);
  });

  ipcMain.handle(IPC.CLEAR_HISTORY, () => {
    clearHistory();
  });

  ipcMain.handle(IPC.HIDE_WINDOW, () => {
    hideWindowGracefully(window);
  });

  ipcMain.handle(IPC.GET_SETTINGS, () => {
    return loadSettings();
  });

  ipcMain.handle(IPC.SAVE_SETTINGS, (_event, settings: Settings) => {
    saveSettings(settings);
    app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
    clipboardService.updateInterval(settings.pollIntervalMs);
    onSettingsChange(settings);
  });

  ipcMain.handle(IPC.EXPORT_SETTINGS, async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(window, {
      defaultPath: 'clipstack-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    fs.writeFileSync(filePath, JSON.stringify(loadSettings(), null, 2), 'utf-8');
    return { success: true };
  });

  ipcMain.handle(IPC.IMPORT_SETTINGS, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(window, {
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return null;
    try {
      const raw = fs.readFileSync(filePaths[0], 'utf-8');
      return JSON.parse(raw) as Partial<Settings>;
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC.GET_GROUPS, () => getGroups());

  ipcMain.handle(IPC.CREATE_GROUP, (_event, name: string) => createGroup(name));

  ipcMain.handle(IPC.DELETE_GROUP, (_event, id: number) => deleteGroup(id));

  ipcMain.handle(IPC.RENAME_GROUP, (_event, id: number, name: string) => renameGroup(id, name));

  ipcMain.handle(
    IPC.ADD_TO_GROUP,
    (_event, groupId: number, content: string, type: ClipboardEntryType, preview: string) =>
      addEntryToGroup(groupId, content, type, preview)
  );

  ipcMain.handle(IPC.REMOVE_FROM_GROUP, (_event, groupId: number, entryId: number) =>
    removeEntryFromGroup(groupId, entryId)
  );

  ipcMain.handle(IPC.SHOW_TOOLTIP, async (_event, text: string) => {
    if (window.getOpacity() < 1) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const { x: dx, y: dy, width: dw, height: dh } = display.workArea;

    const tooltipWidth = 420;
    const maxHeight = 460;
    const offsetX = 14;

    const escaped = JSON.stringify(text);
    const contentHeight: number = await tooltipWindow.webContents.executeJavaScript(`
      (function() {
        var el = document.getElementById('wrap');
        el.style.width = '${tooltipWidth}px';
        el.textContent = ${escaped};
        return Math.min(el.scrollHeight, ${maxHeight});
      })()
    `);

    tooltipWindow.setSize(tooltipWidth, contentHeight);

    // Show to the right; flip left if not enough space
    const spaceRight = (dx + dw) - (cursor.x + offsetX);
    let x = spaceRight >= tooltipWidth
      ? cursor.x + offsetX
      : cursor.x - tooltipWidth - offsetX;

    // Hard clamp to always stay within screen
    x = Math.max(dx, Math.min(x, dx + dw - tooltipWidth));

    // Align top with cursor; push up if it would overflow bottom
    let y = cursor.y;
    if (y + contentHeight > dy + dh) y = dy + dh - contentHeight;
    y = Math.max(dy, y);

    tooltipWindow.setPosition(Math.round(x), Math.round(y));
    tooltipWindow.showInactive();
  });

  ipcMain.handle(IPC.HIDE_TOOLTIP, () => {
    tooltipWindow.hide();
  });

  ipcMain.handle(IPC.BROWSE_FOR_APP, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(window, {
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
    });
    if (canceled || !filePaths[0]) return null;
    const name = filePaths[0].split('/').pop()?.replace(/\.app$/, '') ?? null;
    return name;
  });

  ipcMain.handle(IPC.PASTE_GROUP_ENTRY, (_event, content: string) => {
    clipboardService.writeToClipboard(content);
    hideWindowGracefully(window);
    setTimeout(() => simulatePaste(), 230);
  });
}

function simulatePaste(): void {
  try {
    // Uses AppleScript to trigger Cmd+V in the frontmost application
    const { execSync } = require('child_process') as typeof import('child_process');
    execSync(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`);
  } catch {
    // Accessibility permissions not granted — clipboard is still written, user pastes manually
    console.warn('[ClipStack] Could not simulate paste. Grant Accessibility permissions in System Settings.');
  }
}

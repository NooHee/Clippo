import { ipcMain, BrowserWindow, app, dialog } from 'electron';
import fs from 'fs';
import { IPC } from '../shared/types';
import type { Settings } from '../shared/types';
import { getHistory, deleteEntry, togglePin, clearHistory, incrementUsage } from './db';
import { ClipboardService } from './clipboard';
import { loadSettings, saveSettings } from './settings';
import { getGroups, createGroup, deleteGroup, renameGroup, addEntryToGroup, removeEntryFromGroup } from './groups';
import type { ClipboardEntryType } from '../shared/types';

export function registerIpcHandlers(
  window: BrowserWindow,
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
    window.hide();

    // Simulate Cmd+V after a short delay so the target app receives focus first
    setTimeout(() => simulatePaste(), 150);
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
    window.hide();
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

  ipcMain.handle(IPC.PASTE_GROUP_ENTRY, (_event, content: string) => {
    clipboardService.writeToClipboard(content);
    window.hide();
    setTimeout(() => simulatePaste(), 150);
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

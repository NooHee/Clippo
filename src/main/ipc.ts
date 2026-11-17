import fs from 'node:fs/promises';
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { IPC, type PasteResult, type Settings } from '../shared/types';
import type { HistoryRepository } from './storage/historyRepository';
import type { SettingsRepository } from './storage/settingsRepository';
import { parseSettings } from './storage/settingsRepository';
import type { GroupRepository } from './storage/groupRepository';
import { isFiniteNumber, isString } from './storage/guards';
import { importHistory } from './storage/historyImport';
import type { PopupWindow } from './windows/popupWindow';
import type { TooltipWindow } from './windows/tooltipWindow';
import type { PasteService } from './paste/pasteService';
import type { AccessibilityMonitor } from './permissions/accessibilityMonitor';
import { checkPermissions } from './permissionChecker';
import { openAccessibilitySettings } from './platform/macos';
import { perfMark } from './platform/perf';
import { isAppUrl } from './security/webContentsGuard';
import { parseTooltipTarget, truncateForTooltip } from './windows/tooltipText';

export interface IpcDependencies {
  popup: PopupWindow;
  tooltip: TooltipWindow;
  history: HistoryRepository;
  settings: SettingsRepository;
  groups: GroupRepository;
  paste: PasteService;
  accessibility: AccessibilityMonitor;
  /** Writes text to the clipboard without the watcher recording it as a new entry. */
  writeText: (text: string) => void;
  /** Same for images; returns false if the image file is gone. */
  writeImage: (imageName: string) => boolean;
  onSettingsSaved: (settings: Settings) => void;
}

type Handler = (...args: unknown[]) => unknown;

/**
 * Registers a handler that only accepts calls from our own page in our own popup window.
 * Checking the window alone is not enough: if that window ever showed another page, the preload
 * would expose the API to it too, so the frame URL must also be the page Clippo loaded.
 * Arguments arrive from the renderer, so every handler validates them before use.
 */
function handle(channel: string, trustedSender: WebContents, appUrl: string, handler: Handler): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (event.sender !== trustedSender || !isAppUrl(event.senderFrame?.url, appUrl)) {
      throw new Error(`Rejected IPC call on ${channel}`);
    }
    return handler(...args);
  });
}

function requireId(value: unknown): number {
  if (!isFiniteNumber(value)) throw new TypeError('Expected a numeric id');
  return value;
}

function requireString(value: unknown): string {
  if (!isString(value)) throw new TypeError('Expected a string');
  return value;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  const { popup, tooltip, history, settings, groups, paste } = deps;
  const parent: BrowserWindow = popup.browserWindow;
  const popupContents = parent.webContents;
  const on = (channel: string, handler: Handler): void => handle(channel, popupContents, popup.appUrl, handler);

  // History. The renderer only ever receives previews and refers to entries by id; full content
  // stays in this process (smaller IPC payloads, and the renderer cannot choose what gets pasted).
  on(IPC.GET_HISTORY, (query) => history.list(isString(query) ? query : ''));
  on(IPC.SEARCH_HISTORY, (query) => history.list(requireString(query)));
  on(IPC.DELETE_ENTRY, (id) => history.delete(requireId(id)));
  on(IPC.PIN_ENTRY, (id) => history.togglePin(requireId(id)));
  on(IPC.CLEAR_HISTORY, () => history.clearUnpinned());

  /** Puts a text or image entry on the clipboard, then pastes it into the app the user came from. */
  const pasteContent = async (entry: { content: string; type: string; imageName?: string }): Promise<PasteResult> => {
    if (entry.type === 'image') {
      if (!entry.imageName || !deps.writeImage(entry.imageName)) return 'failed';
    } else {
      deps.writeText(entry.content);
    }
    return paste.pasteIntoPreviousApp();
  };

  // Paste
  on(IPC.PASTE_ENTRY, async (id): Promise<PasteResult> => {
    const done = perfMark('paste.entry');
    const entry = history.find(requireId(id));
    if (!entry) return 'failed';
    history.markUsed(entry.id);
    const result = await pasteContent(entry);
    done();
    return result;
  });
  on(IPC.PASTE_GROUP_ENTRY, async (groupId, entryId): Promise<PasteResult> => {
    const entry = groups.findEntry(requireId(groupId), requireId(entryId));
    return entry ? pasteContent(entry) : 'failed';
  });
  on(IPC.HIDE_WINDOW, () => paste.dismiss());

  // Settings
  on(IPC.GET_SETTINGS, () => settings.get());
  on(IPC.SAVE_SETTINGS, (payload) => {
    const saved = settings.save(parseSettings(payload));
    deps.onSettingsSaved(saved);
  });
  on(IPC.COMPLETE_ONBOARDING, () => {
    settings.update({ onboardingCompleted: true });
  });
  on(IPC.EXPORT_SETTINGS, async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(parent, {
      defaultPath: 'clippo-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    await fs.writeFile(filePath, JSON.stringify(settings.get(), null, 2), 'utf-8');
    return { success: true };
  });
  on(IPC.IMPORT_SETTINGS, async (): Promise<Partial<Settings> | null> => {
    const json = await pickJsonFile(parent);
    if (json === undefined) return null;
    try {
      return parseSettings(json);
    } catch {
      return null;
    }
  });

  // Groups
  on(IPC.GET_GROUPS, () => groups.list());
  on(IPC.CREATE_GROUP, (name) => groups.create(requireString(name)));
  on(IPC.DELETE_GROUP, (id) => groups.delete(requireId(id)));
  on(IPC.RENAME_GROUP, (id, name) => groups.rename(requireId(id), requireString(name)));
  on(IPC.ADD_TO_GROUP, (groupId, historyEntryId) => {
    const entry = history.find(requireId(historyEntryId));
    if (!entry) return null;
    return groups.addEntry(requireId(groupId), entry.content, entry.type, entry.preview, entry.imageName);
  });
  on(IPC.REMOVE_FROM_GROUP, (groupId, entryId) => groups.removeEntry(requireId(groupId), requireId(entryId)));

  // Tooltip
  on(IPC.SHOW_TOOLTIP, async (payload) => {
    if (!popup.isVisible()) return; // Never show a tooltip while the popup is hiding.
    const target = parseTooltipTarget(payload);
    const entry =
      target.kind === 'history' ? history.find(target.id) : groups.findEntry(target.groupId, target.entryId);
    if (!entry || entry.type === 'image') return;
    await tooltip.show(truncateForTooltip(entry.content));
  });
  on(IPC.HIDE_TOOLTIP, () => tooltip.hide());

  // Import / export history
  on(IPC.EXPORT_HISTORY, async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(parent, {
      defaultPath: 'clippo-history.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    await fs.writeFile(filePath, JSON.stringify(history.all(), null, 2), 'utf-8');
    return { success: true };
  });
  on(IPC.IMPORT_HISTORY, async () => {
    const json = await pickJsonFile(parent);
    if (json === undefined) return { success: false, imported: 0, duplicates: 0, errors: [] };
    return importHistory(history, json);
  });

  // System
  on(IPC.BROWSE_FOR_APP, async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(parent, {
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }],
    });
    if (canceled || !filePaths[0]) return null;
    return filePaths[0].split('/').pop()?.replace(/\.app$/, '') ?? null;
  });
  on(IPC.CHECK_PERMISSIONS, () => checkPermissions());
  on(IPC.OPEN_ACCESSIBILITY_SETTINGS, () => openAccessibilitySettings());
  on(IPC.GET_ACCESSIBILITY_STATE, () => deps.accessibility.refresh());
}

/** Opens a file picker and parses the chosen JSON file. Undefined when cancelled or unreadable. */
async function pickJsonFile(parent: BrowserWindow): Promise<unknown> {
  const { filePaths, canceled } = await dialog.showOpenDialog(parent, {
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return undefined;
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(filePaths[0], 'utf-8'));
    return parsed;
  } catch {
    return undefined;
  }
}

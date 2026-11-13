import fs from 'node:fs/promises';
import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { IPC, type PasteResult, type Settings, type UpdateLink } from '../shared/types';
import type { HistoryRepository } from './storage/historyRepository';
import { isEntryType } from './storage/historyRepository';
import type { SettingsRepository } from './storage/settingsRepository';
import { parseSettings } from './storage/settingsRepository';
import type { GroupRepository } from './storage/groupRepository';
import { isFiniteNumber, isString } from './storage/guards';
import { importHistory } from './storage/historyImport';
import type { ImageStore } from './clipboard/imageStore';
import type { PopupWindow } from './windows/popupWindow';
import type { TooltipWindow } from './windows/tooltipWindow';
import type { PasteService } from './paste/pasteService';
import type { UpdateService } from './updates/updateService';
import { checkPermissions } from './permissionChecker';
import { openAccessibilitySettings } from './platform/macos';
import { perfMark } from './platform/perf';

export interface IpcDependencies {
  popup: PopupWindow;
  tooltip: TooltipWindow;
  history: HistoryRepository;
  settings: SettingsRepository;
  groups: GroupRepository;
  images: ImageStore;
  paste: PasteService;
  updates: UpdateService;
  /** Opens the download or release notes of the available update in the browser. */
  openUpdateLink: (link: UpdateLink) => void;
  /** Writes text to the clipboard without the watcher recording it as a new entry. */
  writeText: (text: string) => void;
  /** Same for images; returns false if the image file is gone. */
  writeImage: (imageName: string) => boolean;
  onSettingsSaved: (settings: Settings) => void;
}

type Handler = (...args: unknown[]) => unknown;

/**
 * Registers a handler that only accepts calls from our own popup window.
 * Arguments arrive from the renderer, so every handler validates them before use.
 */
function handle(channel: string, trustedSender: WebContents, handler: Handler): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (event.sender !== trustedSender) throw new Error(`Rejected IPC call on ${channel}`);
    return handler(...args);
  });
}

function requireId(value: unknown): number {
  if (!isFiniteNumber(value)) throw new TypeError('Expected a numeric id');
  return value;
}

function requireUpdateLink(value: unknown): UpdateLink {
  if (value !== 'download' && value !== 'release-notes') throw new TypeError('Expected an update link');
  return value;
}

function requireString(value: unknown): string {
  if (!isString(value)) throw new TypeError('Expected a string');
  return value;
}

export function registerIpcHandlers(deps: IpcDependencies): void {
  const { popup, tooltip, history, settings, groups, images, paste, updates } = deps;
  const parent: BrowserWindow = popup.browserWindow;
  const popupContents = parent.webContents;
  const on = (channel: string, handler: Handler): void => handle(channel, popupContents, handler);

  // History
  on(IPC.GET_HISTORY, (query) => history.list(isString(query) ? query : ''));
  on(IPC.SEARCH_HISTORY, (query) => history.list(requireString(query)));
  on(IPC.DELETE_ENTRY, (id) => history.delete(requireId(id)));
  on(IPC.PIN_ENTRY, (id) => history.togglePin(requireId(id)));
  on(IPC.CLEAR_HISTORY, () => history.clearUnpinned());

  // Paste
  on(IPC.PASTE_ENTRY, async (id, content): Promise<PasteResult> => {
    const done = perfMark('paste.text');
    history.markUsed(requireId(id));
    deps.writeText(requireString(content));
    const result = await paste.pasteIntoPreviousApp();
    done();
    return result;
  });
  on(IPC.PASTE_GROUP_ENTRY, async (content): Promise<PasteResult> => {
    deps.writeText(requireString(content));
    return paste.pasteIntoPreviousApp();
  });
  on(IPC.PASTE_IMAGE, async (imageName): Promise<PasteResult> => {
    if (!deps.writeImage(requireString(imageName))) return 'failed';
    return paste.pasteIntoPreviousApp();
  });
  on(IPC.HIDE_WINDOW, () => paste.dismiss());

  // Images
  on(IPC.GET_IMAGE_PATH, (imageName) => {
    try {
      return images.thumbnailDataUrl(requireString(imageName));
    } catch (error) {
      console.error('[Clippo] Failed to load image thumbnail', error);
      return null;
    }
  });

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
  on(IPC.ADD_TO_GROUP, (groupId, content, type, preview, imageName) => {
    if (!isEntryType(type)) throw new TypeError('Invalid entry type');
    return groups.addEntry(
      requireId(groupId),
      requireString(content),
      type,
      requireString(preview),
      isString(imageName) ? imageName : undefined,
    );
  });
  on(IPC.REMOVE_FROM_GROUP, (groupId, entryId) => groups.removeEntry(requireId(groupId), requireId(entryId)));

  // Tooltip
  on(IPC.SHOW_TOOLTIP, async (text) => {
    if (!popup.isVisible()) return; // Never show a tooltip while the popup is hiding.
    await tooltip.show(requireString(text));
  });
  on(IPC.HIDE_TOOLTIP, () => tooltip.hide());

  // Import / export history
  on(IPC.EXPORT_HISTORY, async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(parent, {
      defaultPath: 'clippo-history.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { success: false };
    await fs.writeFile(filePath, JSON.stringify(history.list(), null, 2), 'utf-8');
    return { success: true };
  });
  on(IPC.IMPORT_HISTORY, async () => {
    const json = await pickJsonFile(parent);
    if (json === undefined) return { success: false, imported: 0, duplicates: 0, errors: [] };
    return importHistory(history, json);
  });

  // Updates: the renderer never sends a URL or version, main uses its own validated status.
  on(IPC.GET_UPDATE_STATUS, () => updates.getStatus());
  on(IPC.CHECK_FOR_UPDATES, () => updates.checkNow());
  on(IPC.OPEN_UPDATE_LINK, (link) => deps.openUpdateLink(requireUpdateLink(link)));
  on(IPC.SKIP_UPDATE, () => {
    const status = updates.getStatus();
    if (status.state !== 'available') return;
    settings.update({ skippedUpdateVersion: status.update.version });
    updates.refresh();
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

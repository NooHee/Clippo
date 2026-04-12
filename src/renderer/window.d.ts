import type { ClipboardEntry, ClipboardEntryType, ClipboardGroup, GroupEntry, Settings } from '../shared/types';

interface ClipStackBridge {
  getHistory: (query?: string) => Promise<ClipboardEntry[]>;
  searchHistory: (query: string) => Promise<ClipboardEntry[]>;
  pasteEntry: (id: number, content: string) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  pinEntry: (id: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  hideWindow: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  exportSettings: () => Promise<{ success: boolean }>;
  importSettings: () => Promise<Partial<Settings> | null>;
  getGroups: () => Promise<ClipboardGroup[]>;
  createGroup: (name: string) => Promise<ClipboardGroup>;
  deleteGroup: (id: number) => Promise<void>;
  renameGroup: (id: number, name: string) => Promise<void>;
  addToGroup: (groupId: number, content: string, type: ClipboardEntryType, preview: string) => Promise<GroupEntry | null>;
  removeFromGroup: (groupId: number, entryId: number) => Promise<void>;
  pasteGroupEntry: (content: string) => Promise<void>;
  browseForApp: () => Promise<string | null>;
  showTooltip: (text: string) => Promise<void>;
  hideTooltip: () => Promise<void>;
  onWindowHidden: (callback: () => void) => () => void;
  onWindowWillHide: (callback: () => void) => () => void;
  onClipboardUpdated: (callback: (entry: ClipboardEntry) => void) => () => void;
}

declare global {
  interface Window {
    clipstack: ClipStackBridge;
  }
}

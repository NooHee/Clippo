import type { ClipboardEntry, ClipboardEntryType, ClipboardGroup, GroupEntry, Settings, PermissionStatus, PasteResult, UpdateLink, UpdateStatus } from '../shared/types';

interface ClipStackBridge {
  getHistory: (query?: string) => Promise<ClipboardEntry[]>;
  searchHistory: (query: string) => Promise<ClipboardEntry[]>;
  pasteEntry: (id: number, content: string) => Promise<PasteResult>;
  deleteEntry: (id: number) => Promise<void>;
  pinEntry: (id: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  hideWindow: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  exportSettings: () => Promise<{ success: boolean }>;
  importSettings: () => Promise<Partial<Settings> | null>;
  exportHistory: () => Promise<{ success: boolean }>;
  importHistory: () => Promise<{ success: boolean; imported: number; duplicates: number; errors: string[] }>;
  getGroups: () => Promise<ClipboardGroup[]>;
  createGroup: (name: string) => Promise<ClipboardGroup>;
  deleteGroup: (id: number) => Promise<void>;
  renameGroup: (id: number, name: string) => Promise<void>;
  addToGroup: (groupId: number, content: string, type: ClipboardEntryType, preview: string, imageName?: string) => Promise<GroupEntry | null>;
  removeFromGroup: (groupId: number, entryId: number) => Promise<void>;
  pasteGroupEntry: (content: string) => Promise<PasteResult>;
  browseForApp: () => Promise<string | null>;
  getImagePath: (imageName: string) => Promise<string | null>;
  pasteImage: (imageName: string) => Promise<PasteResult>;
  showTooltip: (text: string) => Promise<void>;
  hideTooltip: () => Promise<void>;
  checkPermissions: () => Promise<PermissionStatus>;
  completeOnboarding: () => Promise<void>;
  openAccessibilitySettings: () => Promise<void>;
  onPopupWillHide: (callback: () => void) => () => void;
  notifyPopupResetDone: () => void;
  getUpdateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  openUpdateLink: (link: UpdateLink) => Promise<void>;
  skipUpdate: () => Promise<void>;
  onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => () => void;
  onClipboardUpdated: (callback: (entry: ClipboardEntry) => void) => () => void;
}

declare global {
  interface Window {
    clipstack: ClipStackBridge;
  }
}

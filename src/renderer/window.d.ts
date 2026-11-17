import type { ClipboardEntrySummary, ClipboardGroupSummary, GroupEntrySummary, Settings, PermissionStatus, PasteResult, AccessibilityState, TooltipTarget } from '../shared/types';

interface ClipStackBridge {
  getHistory: (query?: string) => Promise<ClipboardEntrySummary[]>;
  searchHistory: (query: string) => Promise<ClipboardEntrySummary[]>;
  pasteEntry: (id: number) => Promise<PasteResult>;
  deleteEntry: (id: number) => Promise<void>;
  /** Resolves to the updated row, or null if the entry no longer exists. */
  pinEntry: (id: number) => Promise<ClipboardEntrySummary | null>;
  clearHistory: () => Promise<void>;
  hideWindow: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  saveSettings: (settings: Settings) => Promise<void>;
  exportSettings: () => Promise<{ success: boolean }>;
  importSettings: () => Promise<Partial<Settings> | null>;
  exportHistory: () => Promise<{ success: boolean }>;
  importHistory: () => Promise<{ success: boolean; imported: number; duplicates: number; errors: string[] }>;
  getGroups: () => Promise<ClipboardGroupSummary[]>;
  createGroup: (name: string) => Promise<ClipboardGroupSummary>;
  deleteGroup: (id: number) => Promise<void>;
  renameGroup: (id: number, name: string) => Promise<void>;
  addToGroup: (groupId: number, historyEntryId: number) => Promise<GroupEntrySummary | null>;
  removeFromGroup: (groupId: number, entryId: number) => Promise<void>;
  pasteGroupEntry: (groupId: number, entryId: number) => Promise<PasteResult>;
  browseForApp: () => Promise<string | null>;
  showTooltip: (target: TooltipTarget) => Promise<void>;
  hideTooltip: () => Promise<void>;
  checkPermissions: () => Promise<PermissionStatus>;
  completeOnboarding: () => Promise<void>;
  openAccessibilitySettings: () => Promise<void>;
  getAccessibilityState: () => Promise<AccessibilityState>;
  onAccessibilityChanged: (callback: (state: AccessibilityState) => void) => () => void;
  onPopupWillHide: (callback: () => void) => () => void;
  notifyPopupResetDone: () => void;
  onClipboardUpdated: (callback: (entry: ClipboardEntrySummary) => void) => () => void;
}

declare global {
  interface Window {
    clipstack: ClipStackBridge;
  }
}

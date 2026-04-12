export type ClipboardEntryType = 'text' | 'image' | 'file';

export interface ClipboardEntry {
  id: number;
  content: string;
  type: ClipboardEntryType;
  preview: string;
  createdAt: number;
  pinnedAt: number | null;
  usageCount: number;
}

export interface Settings {
  hotkey: string;
  maxHistory: number;
  launchAtLogin: boolean;
  pollIntervalMs: number;
  popupPosition: 'tray' | 'mouse';
  dismissOnBlur: boolean;
  theme: 'light' | 'dark' | 'system';
  ignoredApps: string[];
  language: 'en' | 'fr';
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'Command+Shift+V',
  maxHistory: 500,
  launchAtLogin: false,
  pollIntervalMs: 500,
  popupPosition: 'tray',
  dismissOnBlur: true,
  theme: 'system',
  ignoredApps: [],
  language: 'en',
};

export interface GroupEntry {
  id: number;
  content: string;
  type: ClipboardEntryType;
  preview: string;
  addedAt: number;
}

export interface ClipboardGroup {
  id: number;
  name: string;
  createdAt: number;
  entries: GroupEntry[];
}

export interface IpcChannels {
  // Renderer → Main
  GET_HISTORY: 'get-history';
  PASTE_ENTRY: 'paste-entry';
  DELETE_ENTRY: 'delete-entry';
  PIN_ENTRY: 'pin-entry';
  CLEAR_HISTORY: 'clear-history';
  HIDE_WINDOW: 'hide-window';
  SEARCH_HISTORY: 'search-history';
  GET_SETTINGS: 'get-settings';
  SAVE_SETTINGS: 'save-settings';
  EXPORT_SETTINGS: 'export-settings';
  IMPORT_SETTINGS: 'import-settings';
  GET_GROUPS: 'get-groups';
  CREATE_GROUP: 'create-group';
  DELETE_GROUP: 'delete-group';
  RENAME_GROUP: 'rename-group';
  ADD_TO_GROUP: 'add-to-group';
  REMOVE_FROM_GROUP: 'remove-from-group';
  PASTE_GROUP_ENTRY: 'paste-group-entry';
  BROWSE_FOR_APP: 'browse-for-app';
  SHOW_TOOLTIP: 'show-tooltip';
  HIDE_TOOLTIP: 'hide-tooltip';

  // Main → Renderer
  CLIPBOARD_UPDATED: 'clipboard-updated';
}

export const IPC: IpcChannels = {
  GET_HISTORY: 'get-history',
  PASTE_ENTRY: 'paste-entry',
  DELETE_ENTRY: 'delete-entry',
  PIN_ENTRY: 'pin-entry',
  CLEAR_HISTORY: 'clear-history',
  HIDE_WINDOW: 'hide-window',
  SEARCH_HISTORY: 'search-history',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  EXPORT_SETTINGS: 'export-settings',
  IMPORT_SETTINGS: 'import-settings',
  GET_GROUPS: 'get-groups',
  CREATE_GROUP: 'create-group',
  DELETE_GROUP: 'delete-group',
  RENAME_GROUP: 'rename-group',
  ADD_TO_GROUP: 'add-to-group',
  REMOVE_FROM_GROUP: 'remove-from-group',
  PASTE_GROUP_ENTRY: 'paste-group-entry',
  BROWSE_FOR_APP: 'browse-for-app',
  SHOW_TOOLTIP: 'show-tooltip',
  HIDE_TOOLTIP: 'hide-tooltip',
  CLIPBOARD_UPDATED: 'clipboard-updated',
};

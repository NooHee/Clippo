export type ClipboardEntryType = 'text' | 'image' | 'file';

export interface ClipboardEntry {
  id: number;
  content: string;
  type: ClipboardEntryType;
  preview: string;
  createdAt: number;
  pinnedAt: number | null;
  usageCount: number;
  imageName?: string; // For image type entries, stores the image filename
}

/**
 * What the popup receives for one history row: everything it renders and nothing more.
 * The full `content` stays in the main process. Copying it to the renderer on every open and
 * every search keystroke made the cost of the list grow with the size of what was copied.
 */
export type ClipboardEntrySummary = Pick<ClipboardEntry, 'id' | 'type' | 'preview' | 'createdAt' | 'pinnedAt' | 'imageName'>;

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
  onboardingCompleted?: boolean;
  /** Set once the default password apps were added to `ignoredApps`, so removing one sticks. */
  passwordAppsAdded?: boolean;
}

export interface PermissionStatus {
  keychain: boolean;
  systemEvents: boolean;
  accessibility: boolean;
}

/**
 * Whether Clippo may send keystrokes to other apps (macOS Accessibility).
 * - `granted`: auto-paste works.
 * - `missing`: not granted, or granted to an older build (stale toggle). Entries are only copied.
 * - `unsupported`: not macOS; auto-paste does not exist there, so nothing is degraded.
 */
export type AccessibilityState = 'granted' | 'missing' | 'unsupported';

/**
 * Apps whose copies are never recorded, added to the ignored apps list by default. Users can remove
 * any of them in Settings. Most of these also mark passwords as concealed, which Clippo honours
 * too; this list covers versions and apps that do not.
 */
export const PASSWORD_APPS: readonly string[] = [
  '1Password',
  '1Password 7',
  'Bitwarden',
  'Dashlane',
  'Enpass',
  'KeePassXC',
  'Keychain Access',
  'LastPass',
  'Passwords',
  'Proton Pass',
];

/**
 * Text above this size is still on the clipboard (the user can paste it normally) but is not
 * saved in history. One million characters is roughly a 500 page book; only things like whole
 * log files exceed it, and keeping those would slow down every save, search and popup open.
 */
export const MAX_TEXT_LENGTH = 1_000_000;

export const SETTINGS_LIMITS = {
  maxHistory: { min: 1, max: 5000 },
  pollIntervalMs: { min: 100, max: 5000 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'Command+Shift+V',
  maxHistory: 500,
  launchAtLogin: false,
  pollIntervalMs: 500,
  popupPosition: 'tray',
  dismissOnBlur: true,
  theme: 'system',
  ignoredApps: [...PASSWORD_APPS],
  language: 'en',
  passwordAppsAdded: true,
};

export interface GroupEntry {
  id: number;
  content: string;
  type: ClipboardEntryType;
  preview: string;
  addedAt: number;
  imageName?: string; // For image type entries, stores the image filename
}

export interface ClipboardGroup {
  id: number;
  name: string;
  createdAt: number;
  entries: GroupEntry[];
}

/** Same idea as ClipboardEntrySummary for groups: previews only, content stays in main. */
export type GroupEntrySummary = Omit<GroupEntry, 'content'>;

export interface ClipboardGroupSummary extends Omit<ClipboardGroup, 'entries'> {
  entries: GroupEntrySummary[];
}

/** Which entry the hover tooltip should show. The main process looks the text up itself. */
export type TooltipTarget = { kind: 'history'; id: number } | { kind: 'group'; groupId: number; entryId: number };

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
  EXPORT_HISTORY: 'export-history';
  IMPORT_HISTORY: 'import-history';
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
  CHECK_PERMISSIONS: 'check-permissions';
  COMPLETE_ONBOARDING: 'complete-onboarding';
  OPEN_ACCESSIBILITY_SETTINGS: 'open-accessibility-settings';
  POPUP_RESET_DONE: 'popup-reset-done';
  GET_ACCESSIBILITY_STATE: 'get-accessibility-state';

  // Main → Renderer
  CLIPBOARD_UPDATED: 'clipboard-updated';
  POPUP_WILL_HIDE: 'popup-will-hide';
  ACCESSIBILITY_CHANGED: 'accessibility-changed';
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
  EXPORT_HISTORY: 'export-history',
  IMPORT_HISTORY: 'import-history',
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
  CHECK_PERMISSIONS: 'check-permissions',
  COMPLETE_ONBOARDING: 'complete-onboarding',
  OPEN_ACCESSIBILITY_SETTINGS: 'open-accessibility-settings',
  POPUP_RESET_DONE: 'popup-reset-done',
  CLIPBOARD_UPDATED: 'clipboard-updated',
  POPUP_WILL_HIDE: 'popup-will-hide',
  GET_ACCESSIBILITY_STATE: 'get-accessibility-state',
  ACCESSIBILITY_CHANGED: 'accessibility-changed',
};

/**
 * Outcome of a paste request, returned to the renderer.
 * - `pasted`: the entry was written to the clipboard and Cmd+V was sent to the previous app.
 * - `copied`: the entry is on the clipboard but the keystroke could not be sent
 *   (usually missing Accessibility permission), so the user pastes manually.
 * - `failed`: the entry could not be written to the clipboard.
 */
export type PasteResult = 'pasted' | 'copied' | 'failed';


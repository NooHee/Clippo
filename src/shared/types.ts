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
  /** Look for a new release on GitHub in the background (packaged builds only). */
  checkForUpdates: boolean;
  /** A release the user chose to skip: no banner or notification for it. */
  skippedUpdateVersion?: string;
}

export interface PermissionStatus {
  keychain: boolean;
  systemEvents: boolean;
  accessibility: boolean;
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
  checkForUpdates: true,
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
  GET_IMAGE_PATH: 'get-image-path';
  PASTE_IMAGE: 'paste-image';
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
  GET_UPDATE_STATUS: 'get-update-status';
  CHECK_FOR_UPDATES: 'check-for-updates';
  OPEN_UPDATE_LINK: 'open-update-link';
  SKIP_UPDATE: 'skip-update';

  // Main → Renderer
  CLIPBOARD_UPDATED: 'clipboard-updated';
  POPUP_WILL_HIDE: 'popup-will-hide';
  UPDATE_STATUS_CHANGED: 'update-status-changed';
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
  GET_IMAGE_PATH: 'get-image-path',
  PASTE_IMAGE: 'paste-image',
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
  GET_UPDATE_STATUS: 'get-update-status',
  CHECK_FOR_UPDATES: 'check-for-updates',
  OPEN_UPDATE_LINK: 'open-update-link',
  SKIP_UPDATE: 'skip-update',
  CLIPBOARD_UPDATED: 'clipboard-updated',
  POPUP_WILL_HIDE: 'popup-will-hide',
  UPDATE_STATUS_CHANGED: 'update-status-changed',
};

/**
 * Outcome of a paste request, returned to the renderer.
 * - `pasted`: the entry was written to the clipboard and Cmd+V was sent to the previous app.
 * - `copied`: the entry is on the clipboard but the keystroke could not be sent
 *   (usually missing Accessibility permission), so the user pastes manually.
 * - `failed`: the entry could not be written to the clipboard.
 */
export type PasteResult = 'pasted' | 'copied' | 'failed';

/** Which page of an available update to open in the browser. */
export type UpdateLink = 'download' | 'release-notes';

/** A release on GitHub that is newer than the running app. */
export interface AvailableUpdate {
  /** Normalized version, without the `v` prefix (for example `0.3.0`). */
  version: string;
  /** The GitHub Release page, with the release notes. */
  releaseUrl: string;
  /** The build for this Mac's architecture, or the release page when none matches. */
  downloadUrl: string;
  publishedAt: string | null;
  /** The user chose "Skip this version": shown in Settings, but no banner or notification. */
  skipped: boolean;
}

/**
 * What the update checker knows, pushed to the renderer on every change.
 * - `idle`: no check has run yet in this session.
 * - `checking`: a request to GitHub is in flight.
 * - `up-to-date`: the latest release is not newer than the running app.
 * - `available`: a newer release exists.
 * - `error`: the last check failed (offline, rate limited, unexpected response).
 */
export type UpdateStatus = {
  currentVersion: string;
  lastCheckedAt: number | null;
} & (
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'up-to-date' }
  | { state: 'available'; update: AvailableUpdate }
  | { state: 'error' }
);

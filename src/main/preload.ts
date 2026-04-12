import { contextBridge, ipcRenderer } from 'electron';

// IPC channel constants inlined — preload cannot import from shared modules
const IPC = {
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
  CLIPBOARD_UPDATED: 'clipboard-updated',
} as const;

contextBridge.exposeInMainWorld('clipstack', {
  getHistory: (query?: string) =>
    ipcRenderer.invoke(IPC.GET_HISTORY, query),

  searchHistory: (query: string) =>
    ipcRenderer.invoke(IPC.SEARCH_HISTORY, query),

  pasteEntry: (id: number, content: string) =>
    ipcRenderer.invoke(IPC.PASTE_ENTRY, id, content),

  deleteEntry: (id: number) =>
    ipcRenderer.invoke(IPC.DELETE_ENTRY, id),

  pinEntry: (id: number) =>
    ipcRenderer.invoke(IPC.PIN_ENTRY, id),

  clearHistory: () =>
    ipcRenderer.invoke(IPC.CLEAR_HISTORY),

  hideWindow: () =>
    ipcRenderer.invoke(IPC.HIDE_WINDOW),

  getSettings: () =>
    ipcRenderer.invoke(IPC.GET_SETTINGS),

  saveSettings: (settings: unknown) =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),

  exportSettings: () =>
    ipcRenderer.invoke(IPC.EXPORT_SETTINGS),

  importSettings: () =>
    ipcRenderer.invoke(IPC.IMPORT_SETTINGS),

  exportHistory: () =>
    ipcRenderer.invoke(IPC.EXPORT_HISTORY),

  importHistory: () =>
    ipcRenderer.invoke(IPC.IMPORT_HISTORY),

  getGroups: () =>
    ipcRenderer.invoke(IPC.GET_GROUPS),

  createGroup: (name: string) =>
    ipcRenderer.invoke(IPC.CREATE_GROUP, name),

  deleteGroup: (id: number) =>
    ipcRenderer.invoke(IPC.DELETE_GROUP, id),

  renameGroup: (id: number, name: string) =>
    ipcRenderer.invoke(IPC.RENAME_GROUP, id, name),

  addToGroup: (groupId: number, content: string, type: string, preview: string) =>
    ipcRenderer.invoke(IPC.ADD_TO_GROUP, groupId, content, type, preview),

  removeFromGroup: (groupId: number, entryId: number) =>
    ipcRenderer.invoke(IPC.REMOVE_FROM_GROUP, groupId, entryId),

  pasteGroupEntry: (content: string) =>
    ipcRenderer.invoke(IPC.PASTE_GROUP_ENTRY, content),

  browseForApp: () =>
    ipcRenderer.invoke(IPC.BROWSE_FOR_APP),

  showTooltip: (text: string) =>
    ipcRenderer.invoke(IPC.SHOW_TOOLTIP, text),

  hideTooltip: () =>
    ipcRenderer.invoke(IPC.HIDE_TOOLTIP),

  onWindowHidden: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-hidden', handler);
    return () => ipcRenderer.removeListener('window-hidden', handler);
  },

  onWindowWillHide: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('window-will-hide', handler);
    return () => ipcRenderer.removeListener('window-will-hide', handler);
  },


  onClipboardUpdated: (callback: (entry: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, entry: unknown) => callback(entry);
    ipcRenderer.on(IPC.CLIPBOARD_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC.CLIPBOARD_UPDATED, handler);
  },
});

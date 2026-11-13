import path from 'node:path';
import { app, clipboard, globalShortcut, Menu, nativeImage, net, Notification, shell, Tray } from 'electron';
import { DEFAULT_SETTINGS, IPC, type AvailableUpdate, type Settings, type UpdateLink } from '../shared/types';
import { createStorageCodec } from './encrypting';
import { PersistentJsonStore } from './storage/persistentJsonStore';
import { createEmptyHistory, HistoryRepository, parseHistoryData } from './storage/historyRepository';
import { parseSettings, SettingsRepository } from './storage/settingsRepository';
import { createEmptyGroups, GroupRepository, parseGroupData } from './storage/groupRepository';
import { ClipboardWatcher } from './clipboard/clipboardWatcher';
import { ImageStore } from './clipboard/imageStore';
import { PopupWindow } from './windows/popupWindow';
import { TooltipWindow } from './windows/tooltipWindow';
import { ElectronAppActivation } from './paste/appActivation';
import { PasteService } from './paste/pasteService';
import { AccessibilityGuard } from './paste/accessibilityNotice';
import { frontmostAppName, sendPasteKeystroke } from './platform/macos';
import { perfMark, perfSinceStart } from './platform/perf';
import { registerIpcHandlers } from './ipc';
import { GitHubReleaseSource, isTrustedGitHubUrl } from './updates/githubReleases';
import { UpdateService, type ScheduleFn } from './updates/updateService';

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
const FOCUS_SETTLE_MS = 50;
/** Where releases are published (see docs/release-process.md). */
const RELEASES_REPOSITORY = { owner: 'NooHee', repo: 'Clippo' };

/** Works both unpackaged (project root) and packaged (inside app.asar). */
function assetPath(fileName: string): string {
  return path.join(app.getAppPath(), 'assets', fileName);
}

/**
 * Composition root: the only place that knows about every concrete implementation.
 * Everything else receives its collaborators through constructors, which keeps modules
 * small and lets the domain logic be unit tested without Electron.
 */
function bootstrap(): void {
  perfSinceStart('app.ready');
  if (isMac) app.dock?.hide(); // Packaged builds are LSUIElement already; this covers `npm start`.

  const activation = new ElectronAppActivation(app);
  const userData = app.getPath('userData');
  const codec = createStorageCodec();

  const settingsStore = new PersistentJsonStore<Settings>({
    filePath: path.join(userData, 'clippo-settings.json'),
    createDefault: () => ({ ...DEFAULT_SETTINGS }),
    parse: parseSettings,
    codec,
  });
  const settings = new SettingsRepository(settingsStore);

  let tray: Tray | null = null;
  let refreshTrayMenu: () => void = () => undefined;
  const tooltip = new TooltipWindow(assetPath('tooltip.html'));

  // 1. Start loading the renderer first: Chromium boots it in another process while the
  //    main process continues with the work below.
  const popup = new PopupWindow({
    preloadPath: path.join(__dirname, 'preload.js'),
    devServerUrl: isDev ? 'http://localhost:5173' : undefined,
    indexHtmlPath: path.join(app.getAppPath(), 'dist/renderer/index.html'),
    popupPosition: () => settings.get().popupPosition,
    dismissOnBlur: () => settings.get().dismissOnBlur,
    trayBounds: () => tray?.getBounds() ?? null,
    onHide: () => tooltip.hide(),
  });

  // Update checks never run before the first check delay, so they add nothing to startup.
  const updates = new UpdateService({
    currentVersion: app.getVersion(),
    arch: process.arch,
    source: new GitHubReleaseSource({
      ...RELEASES_REPOSITORY,
      userAgent: `Clippo/${app.getVersion()}`,
      fetch: (url, init) => net.fetch(url, init),
    }),
    schedule: scheduleUnref,
    now: Date.now,
    isAutoCheckEnabled: () => settings.get().checkForUpdates,
    skippedVersion: () => settings.get().skippedUpdateVersion,
    onStatusChange: (status) => {
      popup.browserWindow.webContents.send(IPC.UPDATE_STATUS_CHANGED, status);
      refreshTrayMenu();
    },
    onUpdateFound: (update) => notifyUpdateAvailable(update, () => openUpdateLink('download')),
  });

  /** The URL comes from our own validated status, never from the renderer. */
  const openUpdateLink = (link: UpdateLink): void => {
    const status = updates.getStatus();
    if (status.state !== 'available') return;
    const url = link === 'download' ? status.update.downloadUrl : status.update.releaseUrl;
    if (isTrustedGitHubUrl(url)) void shell.openExternal(url);
  };

  /** "Check for Updates…" from the tray: the popup is closed, so always answer with a notification. */
  const checkForUpdatesFromTray = async (): Promise<void> => {
    const status = await updates.checkNow();
    if (status.state === 'available') {
      notifyUpdateAvailable(status.update, () => openUpdateLink('download'));
    } else {
      showNotification(
        status.state === 'up-to-date' ? 'Clippo is up to date' : 'Could not check for updates',
        status.state === 'up-to-date'
          ? `You are running the latest version (${status.currentVersion}).`
          : 'Check your internet connection and try again.',
      );
    }
  };

  // 2. Load stored data now (disk read + Keychain decryption) instead of on the first open.
  const images = new ImageStore(path.join(userData, 'images'));
  const historyStore = new PersistentJsonStore({
    filePath: path.join(userData, 'clippo-history.json'),
    createDefault: createEmptyHistory,
    parse: parseHistoryData,
    codec,
  });
  const history = new HistoryRepository(historyStore, {
    maxHistory: () => settings.get().maxHistory,
    onEntryRemoved: (entry) => {
      if (entry.type === 'image' && entry.imageName) images.delete(entry.imageName);
    },
  });
  history.warmUp();

  const groupStore = new PersistentJsonStore({
    filePath: path.join(userData, 'clippo-groups.json'),
    createDefault: createEmptyGroups,
    parse: parseGroupData,
    codec,
  });
  const groups = new GroupRepository(groupStore);

  const watcher = new ClipboardWatcher({
    clipboard,
    history,
    saveImage: (fingerprint) => {
      const image = clipboard.readImage();
      return image.isEmpty() ? null : images.save(image, fingerprint);
    },
    ignoredApps: () => settings.get().ignoredApps,
    frontmostAppName,
    onNewEntry: (entry) => popup.browserWindow.webContents.send(IPC.CLIPBOARD_UPDATED, entry),
  });

  const accessibility = new AccessibilityGuard();
  const paste = new PasteService({
    hidePopup: () => popup.hide(),
    activation,
    sendPasteKeystroke: () => sendPasteKeystroke(),
    isAutoPasteSupported: isMac,
    hasAccessibilityPermission: () => accessibility.isTrusted(),
    onAccessibilityMissing: () => accessibility.explain(),
    // The previous app becomes active right after Clippo resigns, but making its window key and
    // restoring the caret happens on its own run loop; a short pause avoids racing it.
    waitForFocusToSettle: () => new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS)),
    logger: console,
  });

  registerIpcHandlers({
    popup,
    tooltip,
    history,
    settings,
    groups,
    images,
    paste,
    updates,
    openUpdateLink,
    writeText: (text) => {
      clipboard.writeText(text);
      watcher.rememberCurrentContent();
    },
    writeImage: (imageName) => {
      const image = images.read(imageName);
      if (!image) return false;
      clipboard.writeImage(image);
      watcher.rememberCurrentContent();
      return true;
    },
    onSettingsSaved: (saved) => {
      app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin });
      watcher.updateInterval(saved.pollIntervalMs);
      registerHotkey(saved.hotkey, () => popup.toggle());
      updates.refresh();
    },
  });

  tray = createTray(() => popup.toggle());
  const trayIcon = tray;
  refreshTrayMenu = () =>
    trayIcon.setContextMenu(
      buildTrayMenu({
        update: availableUpdate(updates),
        onToggle: () => popup.toggle(),
        onDownloadUpdate: () => openUpdateLink('download'),
        onCheckForUpdates: () => void checkForUpdatesFromTray(),
      }),
    );
  refreshTrayMenu();
  registerHotkey(settings.get().hotkey, () => popup.toggle());
  app.setLoginItemSettings({ openAtLogin: settings.get().launchAtLogin });
  watcher.start(settings.get().pollIntervalMs);
  // Development and test runs (unpackaged) never phone home on their own; "Check now" still works.
  if (app.isPackaged) updates.start();

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    watcher.stop();
    updates.stop();
    // Debounced writes may still be pending; the event loop will not run again after this.
    [settingsStore, historyStore, groupStore].forEach((store) => {
      try {
        store.flushSync();
      } catch (error) {
        console.error('[Clippo] Failed to save on quit', error);
      }
    });
  });

  app.on('second-instance', () => void popup.show());
  popup.browserWindow.once('ready-to-show', () => perfSinceStart('popup.ready-to-show'));
}

function createTray(onToggle: () => void): Tray {
  const icon = nativeImage.createFromPath(assetPath('trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('Clippo');
  tray.on('click', onToggle);
  return tray;
}

interface TrayMenuOptions {
  /** A newer, not skipped release: shown first so it is hard to miss. */
  update: AvailableUpdate | null;
  onToggle: () => void;
  onDownloadUpdate: () => void;
  onCheckForUpdates: () => void;
}

function buildTrayMenu({ update, onToggle, onDownloadUpdate, onCheckForUpdates }: TrayMenuOptions): Menu {
  const updateItems: Electron.MenuItemConstructorOptions[] = update
    ? [{ label: `Download Clippo ${update.version}…`, click: onDownloadUpdate }, { type: 'separator' }]
    : [];
  return Menu.buildFromTemplate([
    ...updateItems,
    { label: 'Open Clippo', click: onToggle },
    { label: 'Check for Updates…', click: onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function availableUpdate(updates: UpdateService): AvailableUpdate | null {
  const status = updates.getStatus();
  return status.state === 'available' && !status.update.skipped ? status.update : null;
}

function showNotification(title: string, body: string, onClick?: () => void): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title, body });
  if (onClick) notification.on('click', onClick);
  notification.show();
}

function notifyUpdateAvailable(update: AvailableUpdate, onClick: () => void): void {
  showNotification(`Clippo ${update.version} is available`, 'Click to download the new version.', onClick);
}

/** One-shot timer that does not keep the process alive on its own. */
const scheduleUnref: ScheduleFn = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
};

/**
 * The hotkey handler only toggles the window. It used to run a synchronous `osascript` first to
 * capture the frontmost app name, blocking the main thread before the popup could appear.
 * Focus restoration no longer needs that name (see PasteService).
 */
function registerHotkey(hotkey: string, onToggle: () => void): void {
  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(hotkey, () => {
    const done = perfMark('hotkey.toggle');
    onToggle();
    done();
  });
  if (!registered) console.warn(`[Clippo] Could not register the global shortcut "${hotkey}".`);
}

// A second launch (for example from Finder) focuses the running instance instead of starting a
// new one with its own tray icon and clipboard watcher.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('window-all-closed', () => {
    // Menu bar app: keep running without windows.
  });
  void app.whenReady().then(bootstrap);
}

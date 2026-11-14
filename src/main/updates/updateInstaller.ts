import { normalizeVersion } from './version';

/** Installs an update in place. Only available where macOS can replace the running app. */
export interface UpdateInstaller {
  /** Downloads and verifies `version`, reporting progress from 0 to 100. */
  download(version: string, onProgress: (percent: number) => void): Promise<void>;
  /**
   * Hands the downloaded update to macOS, which swaps the app bundle and relaunches Clippo.
   * Never resolves on success because the process exits. Rejects when the install fails, for
   * example when the update's code signature does not match the running app.
   */
  installAndRestart(): Promise<void>;
}

/** The part of electron-updater's `autoUpdater` this module uses, so tests can fake it. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ updateInfo: { version: string } } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'download-progress' | 'error', listener: (...args: never[]) => void): unknown;
}

export type ScheduleTimeout = (callback: () => void, delayMs: number) => () => void;

export interface ElectronUpdaterInstallerOptions {
  /** Loads electron-updater on first use, so it costs nothing at startup. */
  load: () => Promise<AutoUpdaterLike>;
  schedule: ScheduleTimeout;
  /** How long to wait for macOS to restart the app before reporting a failure. */
  installTimeoutMs?: number;
}

export const INSTALL_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Installs updates through electron-updater, which on macOS downloads the release `.zip` listed
 * in `latest-mac.yml`, checks its SHA-512, and passes it to Squirrel.Mac (Electron's native
 * updater). Squirrel.Mac only accepts an update whose code signature satisfies the running app's
 * designated requirement, then replaces the bundle and relaunches.
 *
 * electron-updater has its own release lookup. Before downloading, this class checks that it
 * found the same version the UI offered, so the user never installs something they were not shown.
 */
export class ElectronUpdaterInstaller implements UpdateInstaller {
  private updater: AutoUpdaterLike | null = null;

  constructor(private readonly options: ElectronUpdaterInstallerOptions) {}

  async download(version: string, onProgress: (percent: number) => void): Promise<void> {
    const updater = await this.getUpdater();
    const result = await updater.checkForUpdates();
    const found = result ? normalizeVersion(result.updateInfo.version) : null;
    if (found !== normalizeVersion(version)) {
      throw new Error(`Expected update ${version}, electron-updater found ${found ?? 'nothing'}`);
    }

    const listener = (progress: { percent: number }): void => onProgress(progress.percent);
    updater.on('download-progress', listener);
    try {
      await updater.downloadUpdate();
    } finally {
      updater.removeListener('download-progress', listener);
    }
    onProgress(100);
  }

  async installAndRestart(): Promise<void> {
    const updater = await this.getUpdater();
    const timeoutMs = this.options.installTimeoutMs ?? INSTALL_TIMEOUT_MS;

    return new Promise<void>((_resolve, reject) => {
      let cancelTimeout: () => void = () => undefined;
      const onError = (error: Error): void => {
        cancelTimeout();
        reject(error);
      };
      updater.on('error', onError);
      cancelTimeout = this.options.schedule(() => {
        updater.removeListener('error', onError);
        reject(new Error('macOS did not restart Clippo to install the update'));
      }, timeoutMs);
      updater.quitAndInstall();
    });
  }

  private async getUpdater(): Promise<AutoUpdaterLike> {
    if (!this.updater) {
      const updater = await this.options.load();
      // Downloading and installing only happen when the user clicks "Update".
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      this.updater = updater;
    }
    return this.updater;
  }
}

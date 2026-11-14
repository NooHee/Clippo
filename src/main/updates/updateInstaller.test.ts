import { describe, expect, it } from 'vitest';
import { ElectronUpdaterInstaller, INSTALL_TIMEOUT_MS, type AutoUpdaterLike } from './updateInstaller';

type Listener = (...args: never[]) => void;

/** Records what electron-updater is asked to do and lets the test emit its events. */
class FakeAutoUpdater implements AutoUpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  readonly calls: string[] = [];
  latestVersion: string | null = '0.3.0';
  readonly listeners = new Map<string, Set<Listener>>();
  progressDuringDownload: number[] = [];

  async checkForUpdates(): Promise<{ updateInfo: { version: string } } | null> {
    this.calls.push('check');
    return this.latestVersion ? { updateInfo: { version: this.latestVersion } } : null;
  }

  async downloadUpdate(): Promise<unknown> {
    this.calls.push('download');
    this.progressDuringDownload.forEach((percent) => this.emit('download-progress', { percent }));
    return [];
  }

  quitAndInstall(): void {
    this.calls.push('quitAndInstall');
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  removeListener(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: unknown): void {
    this.listeners.get(event)?.forEach((listener) => (listener as (value: unknown) => void)(payload));
  }

  count(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

function setup() {
  const updater = new FakeAutoUpdater();
  const timers: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];
  let loads = 0;
  const installer = new ElectronUpdaterInstaller({
    load: async () => {
      loads++;
      return updater;
    },
    schedule: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  return { installer, updater, timers, loads: () => loads };
}

describe('ElectronUpdaterInstaller.download', () => {
  it('loads electron-updater once, turns off its automatic behaviour and forwards progress', async () => {
    const { installer, updater, loads } = setup();
    updater.progressDuringDownload = [12.5, 80];
    const progress: number[] = [];

    await installer.download('0.3.0', (percent) => progress.push(percent));
    await installer.download('0.3.0', () => undefined);

    expect(loads()).toBe(1);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.calls).toEqual(['check', 'download', 'check', 'download']);
    expect(progress).toEqual([12.5, 80, 100]);
    expect(updater.count('download-progress')).toBe(0);
  });

  it('accepts a v-prefixed version from latest-mac.yml', async () => {
    const { installer, updater } = setup();
    updater.latestVersion = 'v0.3.0';
    await expect(installer.download('0.3.0', () => undefined)).resolves.toBeUndefined();
  });

  it('refuses to download a different version than the one offered', async () => {
    const { installer, updater } = setup();
    updater.latestVersion = '0.4.0';

    await expect(installer.download('0.3.0', () => undefined)).rejects.toThrow('Expected update 0.3.0');
    expect(updater.calls).toEqual(['check']);
  });

  it('refuses when electron-updater finds nothing', async () => {
    const { installer, updater } = setup();
    updater.latestVersion = null;
    await expect(installer.download('0.3.0', () => undefined)).rejects.toThrow('found nothing');
  });
});

describe('ElectronUpdaterInstaller.installAndRestart', () => {
  it('asks macOS to install and relaunch, with a safety timeout', async () => {
    const { installer, updater, timers } = setup();

    void installer.installAndRestart();
    await new Promise((resolve) => setImmediate(resolve));

    expect(updater.calls).toEqual(['quitAndInstall']);
    expect(timers.map((timer) => timer.delayMs)).toEqual([INSTALL_TIMEOUT_MS]);
  });

  it('rejects when Squirrel reports an error, for example a signature mismatch', async () => {
    const { installer, updater, timers } = setup();

    const installing = installer.installAndRestart();
    await new Promise((resolve) => setImmediate(resolve));
    updater.emit('error', new Error('Code signature did not pass validation'));

    await expect(installing).rejects.toThrow('Code signature');
    expect(timers[0].cancelled).toBe(true);
  });

  it('rejects when the app is still running after the timeout', async () => {
    const { installer, updater, timers } = setup();

    const installing = installer.installAndRestart();
    await new Promise((resolve) => setImmediate(resolve));
    timers[0].callback();

    await expect(installing).rejects.toThrow('did not restart');
    expect(updater.count('error')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { AvailableUpdate, UpdateStatus } from '../../shared/types';
import type { LatestRelease, ReleaseSource } from './githubReleases';
import type { UpdateInstaller } from './updateInstaller';
import { CHECK_INTERVAL_MS, INITIAL_CHECK_DELAY_MS, UpdateService, type ScheduleFn } from './updateService';

const NOW = 1_700_000_000_000;

function release(version: string): LatestRelease {
  return {
    version,
    releaseUrl: `https://github.com/NooHee/Clippo/releases/tag/v${version}`,
    publishedAt: '2026-11-20T10:00:00Z',
    assets: [
      { name: `Clippo-${version}-arm64-mac.zip`, url: `https://github.com/dl/Clippo-${version}-arm64-mac.zip` },
      { name: `Clippo-${version}.dmg`, url: `https://github.com/dl/Clippo-${version}.dmg` },
    ],
  };
}

/** A release source whose answers are queued by the test. */
class FakeSource implements ReleaseSource {
  calls = 0;
  readonly answers: Array<LatestRelease | null | Error> = [];

  async latest(): Promise<LatestRelease | null> {
    this.calls++;
    const answer = this.answers.shift() ?? null;
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

/**
 * Records scheduled callbacks so the test fires them explicitly: deterministic and with no fake
 * timers, the clock never matters.
 */
class ManualScheduler {
  readonly pending: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> = [];

  readonly schedule: ScheduleFn = (callback, delayMs) => {
    const job = { callback, delayMs, cancelled: false };
    this.pending.push(job);
    return () => {
      job.cancelled = true;
    };
  };

  /** Fires the most recent live job and waits for the check it started to settle. */
  async fireNext(): Promise<number> {
    const job = this.pending.filter((candidate) => !candidate.cancelled).pop();
    if (!job) throw new Error('nothing scheduled');
    job.cancelled = true;
    job.callback();
    await new Promise((resolve) => setImmediate(resolve));
    return job.delayMs;
  }

  live(): number[] {
    return this.pending.filter((job) => !job.cancelled).map((job) => job.delayMs);
  }
}

/**
 * Installer whose download and install are settled by the test, to observe every intermediate
 * status. A real install never resolves because the app restarts.
 */
class FakeInstaller implements UpdateInstaller {
  readonly calls: string[] = [];
  progress: (percent: number) => void = () => undefined;
  private finishDownload: (() => void) | null = null;
  private failDownload: ((error: Error) => void) | null = null;
  private failInstall: ((error: Error) => void) | null = null;

  download(version: string, onProgress: (percent: number) => void): Promise<void> {
    this.calls.push(`download ${version}`);
    this.progress = onProgress;
    return new Promise((resolve, reject) => {
      this.finishDownload = resolve;
      this.failDownload = reject;
    });
  }

  installAndRestart(): Promise<void> {
    this.calls.push('install');
    return new Promise((_resolve, reject) => {
      this.failInstall = reject;
    });
  }

  async completeDownload(): Promise<void> {
    this.finishDownload?.();
    await settle();
  }

  async rejectDownload(): Promise<void> {
    this.failDownload?.(new Error('network lost'));
    await settle();
  }

  async rejectInstall(): Promise<void> {
    this.failInstall?.(new Error('code signature did not pass validation'));
    await settle();
  }
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function setup(
  options: { currentVersion?: string; arch?: string; autoCheck?: boolean; skipped?: string; installer?: UpdateInstaller | null } = {},
) {
  const source = new FakeSource();
  const scheduler = new ManualScheduler();
  const statuses: UpdateStatus[] = [];
  const found: AvailableUpdate[] = [];
  const settings = { autoCheck: options.autoCheck ?? true, skipped: options.skipped };
  const service = new UpdateService({
    currentVersion: options.currentVersion ?? '0.2.1',
    arch: options.arch ?? 'arm64',
    source,
    installer: options.installer ?? null,
    schedule: scheduler.schedule,
    now: () => NOW,
    isAutoCheckEnabled: () => settings.autoCheck,
    skippedVersion: () => settings.skipped,
    onStatusChange: (status) => statuses.push(status),
    onUpdateFound: (update) => found.push(update),
  });
  return { service, source, scheduler, statuses, found, settings };
}

describe('UpdateService.checkNow', () => {
  it('starts idle with the running version', () => {
    const { service } = setup();
    expect(service.getStatus()).toEqual({ state: 'idle', currentVersion: '0.2.1', lastCheckedAt: null, canInstall: false });
  });

  it('reports a newer release with the download for this Mac and notifies once', async () => {
    const { service, source, statuses, found } = setup({ arch: 'arm64' });
    source.answers.push(release('0.3.0'));

    const status = await service.checkNow();

    expect(statuses.map((s) => s.state)).toEqual(['checking', 'available']);
    expect(status).toEqual({
      state: 'available',
      currentVersion: '0.2.1',
      lastCheckedAt: NOW,
      canInstall: false,
      installFailed: false,
      update: {
        version: '0.3.0',
        releaseUrl: 'https://github.com/NooHee/Clippo/releases/tag/v0.3.0',
        downloadUrl: 'https://github.com/dl/Clippo-0.3.0-arm64-mac.zip',
        publishedAt: '2026-11-20T10:00:00Z',
        skipped: false,
      },
    });
    expect(found.map((u) => u.version)).toEqual(['0.3.0']);
  });

  it('does not notify twice for the same version in one session', async () => {
    const { service, source, found } = setup();
    source.answers.push(release('0.3.0'), release('0.3.0'), release('0.4.0'));

    await service.checkNow();
    await service.checkNow();
    await service.checkNow();

    expect(found.map((u) => u.version)).toEqual(['0.3.0', '0.4.0']);
  });

  it.each([
    ['the same version', release('0.2.1')],
    ['an older version', release('0.2.0')],
    ['no release at all', null],
  ])('is up to date when GitHub has %s', async (_label, answer) => {
    const { service, source, found } = setup();
    source.answers.push(answer);

    expect((await service.checkNow()).state).toBe('up-to-date');
    expect(found).toEqual([]);
  });

  it('marks a skipped version and does not notify for it', async () => {
    const { service, source, found } = setup({ skipped: '0.3.0' });
    source.answers.push(release('0.3.0'));

    const status = await service.checkNow();

    expect(status.state === 'available' && status.update.skipped).toBe(true);
    expect(found).toEqual([]);
  });

  it('reports an error when the check fails and nothing was found before', async () => {
    const { service, source } = setup();
    source.answers.push(new Error('offline'));

    expect(await service.checkNow()).toEqual({ state: 'error', currentVersion: '0.2.1', lastCheckedAt: NOW, canInstall: false });
  });

  it('keeps showing a found update when a later check fails', async () => {
    const { service, source } = setup();
    source.answers.push(release('0.3.0'), new Error('offline'));

    await service.checkNow();
    const status = await service.checkNow();

    expect(status.state === 'available' && status.update.version).toBe('0.3.0');
  });

  it('shares one request between concurrent checks', async () => {
    const { service, source } = setup();
    source.answers.push(release('0.3.0'));

    const [first, second] = await Promise.all([service.checkNow(), service.checkNow()]);

    expect(source.calls).toBe(1);
    expect(second).toBe(first);
  });
});

describe('UpdateService.install', () => {
  async function withAvailableUpdate() {
    const installer = new FakeInstaller();
    const context = setup({ installer });
    context.source.answers.push(release('0.3.0'));
    await context.service.checkNow();
    return { ...context, installer };
  }

  it('reports that installing is possible when an installer exists', async () => {
    const { service } = await withAvailableUpdate();
    expect(service.getStatus().canInstall).toBe(true);
  });

  it('downloads with whole-percent progress, then installs and restarts', async () => {
    const { service, installer, statuses } = await withAvailableUpdate();

    void service.install();
    await settle();
    installer.progress(10.2);
    installer.progress(10.8);
    installer.progress(57.5);
    await installer.completeDownload();

    expect(installer.calls).toEqual(['download 0.3.0', 'install']);
    const progress = statuses.filter((s) => s.state === 'downloading').map((s) => (s.state === 'downloading' ? s.percent : -1));
    expect(progress).toEqual([0, 10, 57]);
    expect(service.getStatus().state).toBe('installing');
  });

  it('falls back to the manual download when the download fails', async () => {
    const { service, installer } = await withAvailableUpdate();

    const installing = service.install();
    await settle();
    await installer.rejectDownload();
    await installing;

    const status = service.getStatus();
    expect(status.state === 'available' && status.installFailed).toBe(true);
    expect(installer.calls).toEqual(['download 0.3.0']);
  });

  it('falls back to the manual download when macOS refuses the update', async () => {
    const { service, installer } = await withAvailableUpdate();

    const installing = service.install();
    await settle();
    await installer.completeDownload();
    await installer.rejectInstall();
    await installing;

    const status = service.getStatus();
    expect(status.state === 'available' && status.installFailed).toBe(true);
  });

  it('ignores checks and repeated clicks while an update is being applied', async () => {
    const { service, source, installer } = await withAvailableUpdate();

    void service.install();
    await settle();
    void service.install();
    const status = await service.checkNow();

    expect(status.state).toBe('downloading');
    expect(source.calls).toBe(1);
    expect(installer.calls).toEqual(['download 0.3.0']);
  });

  it('does nothing without an installer or without an update', async () => {
    const { service, statuses } = setup();
    await service.install();
    expect(statuses).toEqual([]);
  });
});

describe('UpdateService.refresh', () => {
  it('re-evaluates the skipped flag after the user skips the version', async () => {
    const { service, source, settings, statuses } = setup();
    source.answers.push(release('0.3.0'));
    await service.checkNow();

    settings.skipped = '0.3.0';
    service.refresh();

    const status = service.getStatus();
    expect(status.state === 'available' && status.update.skipped).toBe(true);
    expect(statuses).toHaveLength(3);
  });

  it('emits nothing when there is no update or nothing changed', async () => {
    const { service, statuses } = setup();
    service.refresh();
    expect(statuses).toEqual([]);
  });
});

describe('UpdateService schedule', () => {
  it('checks after the initial delay, then once per interval', async () => {
    const { service, source, scheduler } = setup();
    source.answers.push(release('0.2.1'), release('0.3.0'));

    service.start();
    expect(scheduler.live()).toEqual([INITIAL_CHECK_DELAY_MS]);

    await scheduler.fireNext();
    expect(source.calls).toBe(1);
    expect(scheduler.live()).toEqual([CHECK_INTERVAL_MS]);

    await scheduler.fireNext();
    expect(source.calls).toBe(2);
    expect(service.getStatus().state).toBe('available');
    expect(scheduler.live()).toEqual([CHECK_INTERVAL_MS]);
  });

  it('skips scheduled checks while automatic checks are off, but keeps the schedule', async () => {
    const { service, source, scheduler, settings } = setup({ autoCheck: false });

    service.start();
    await scheduler.fireNext();
    expect(source.calls).toBe(0);
    expect(scheduler.live()).toEqual([CHECK_INTERVAL_MS]);

    settings.autoCheck = true;
    await scheduler.fireNext();
    expect(source.calls).toBe(1);
  });

  it('stop cancels the pending check', () => {
    const { service, scheduler } = setup();
    service.start();
    service.stop();
    expect(scheduler.live()).toEqual([]);
  });
});

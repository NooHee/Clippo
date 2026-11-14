import type { AvailableUpdate, UpdateStatus } from '../../shared/types';
import { pickDownloadUrl, type ReleaseSource } from './githubReleases';
import type { UpdateInstaller } from './updateInstaller';
import { isNewerVersion } from './version';

/** First background check: well after launch, so it never competes with startup work. */
export const INITIAL_CHECK_DELAY_MS = 30_000;
/** Then every 6 hours: 4 requests a day, far below GitHub's 60 per hour anonymous limit. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Runs `callback` once after `delayMs`; returns a function that cancels it. */
export type ScheduleFn = (callback: () => void, delayMs: number) => () => void;

export interface UpdateServiceDeps {
  currentVersion: string;
  /** `process.arch`: decides which build to download. */
  arch: string;
  source: ReleaseSource;
  /** Null where Clippo cannot replace itself (development, other platforms): download only. */
  installer: UpdateInstaller | null;
  schedule: ScheduleFn;
  now: () => number;
  /** Read on every scheduled tick, so turning the setting off takes effect without a restart. */
  isAutoCheckEnabled: () => boolean;
  skippedVersion: () => string | undefined;
  onStatusChange: (status: UpdateStatus) => void;
  /** Called once per version per session, and never for a skipped version. */
  onUpdateFound: (update: AvailableUpdate) => void;
}

/** States in which an update is being applied: checks must not overwrite them. */
const BUSY_STATES: ReadonlySet<UpdateStatus['state']> = new Set(['downloading', 'installing']);

/**
 * Decides when to check for a new release, what the result means, and drives the install. It owns
 * no Electron API: the network, installer, timers, clock, settings and notifications are injected,
 * so every rule below is unit tested without a real app, network or fake timers.
 */
export class UpdateService {
  private status: UpdateStatus;
  private inFlight: Promise<UpdateStatus> | null = null;
  private cancelTimer: (() => void) | null = null;
  private readonly notifiedVersions = new Set<string>();
  /** Last update found, kept so a later failed check (for example offline) does not hide it. */
  private lastUpdate: AvailableUpdate | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.status = { state: 'idle', ...this.envelope(null) };
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  /** Starts the background schedule: one check after a delay, then one per interval. */
  start(): void {
    this.scheduleNext(INITIAL_CHECK_DELAY_MS);
  }

  stop(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  /**
   * Checks GitHub now (the "Check for updates" button and the schedule both land here).
   * Concurrent calls share one request instead of firing several, and a check never interrupts
   * an update that is downloading or installing.
   */
  checkNow(): Promise<UpdateStatus> {
    if (BUSY_STATES.has(this.status.state)) return Promise.resolve(this.status);
    this.inFlight ??= this.runCheck().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * "Update" button: downloads the offered version, then lets macOS replace the app and relaunch
   * it. When anything fails the app keeps running and the status falls back to `available` with
   * `installFailed`, so the UI offers the manual download.
   */
  async install(): Promise<void> {
    const { installer } = this.deps;
    if (this.status.state !== 'available' || !installer) return;
    const { update } = this.status;
    const base = this.envelope(this.status.lastCheckedAt);

    this.setStatus({ state: 'downloading', update, percent: 0, ...base });
    try {
      await installer.download(update.version, (percent) => {
        const rounded = Math.min(100, Math.max(0, Math.floor(percent)));
        // Progress events are frequent; only whole-percent changes reach the UI.
        if (this.status.state === 'downloading' && rounded !== this.status.percent) {
          this.setStatus({ state: 'downloading', update, percent: rounded, ...base });
        }
      });
      this.setStatus({ state: 'installing', update, ...base });
      await installer.installAndRestart();
    } catch (error) {
      console.warn('[Clippo] Automatic update failed, offering the manual download', error);
      this.setStatus({ state: 'available', update, installFailed: true, ...base });
    }
  }

  /** Re-evaluates the current result after the skipped version changed in the settings. */
  refresh(): void {
    if (this.status.state !== 'available') return;
    const skipped = this.status.update.version === this.deps.skippedVersion();
    if (skipped === this.status.update.skipped) return;
    this.lastUpdate = { ...this.status.update, skipped };
    this.setStatus({ ...this.status, update: this.lastUpdate });
  }

  private scheduleNext(delayMs: number): void {
    this.cancelTimer?.();
    this.cancelTimer = this.deps.schedule(() => void this.onScheduledTick(), delayMs);
  }

  private async onScheduledTick(): Promise<void> {
    if (this.deps.isAutoCheckEnabled()) await this.checkNow();
    // Chained one-shot timers rather than setInterval: a slow check can never overlap the next.
    this.scheduleNext(CHECK_INTERVAL_MS);
  }

  private async runCheck(): Promise<UpdateStatus> {
    this.setStatus({ state: 'checking', ...this.envelope(this.status.lastCheckedAt) });

    try {
      const release = await this.deps.source.latest();
      const base = this.envelope(this.deps.now());
      if (!release || !isNewerVersion(release.version, this.deps.currentVersion)) {
        this.lastUpdate = null;
        this.setStatus({ state: 'up-to-date', ...base });
        return this.status;
      }

      const update: AvailableUpdate = {
        version: release.version,
        releaseUrl: release.releaseUrl,
        downloadUrl: pickDownloadUrl(release, this.deps.arch),
        publishedAt: release.publishedAt,
        skipped: release.version === this.deps.skippedVersion(),
      };
      this.lastUpdate = update;
      this.setStatus({ state: 'available', update, installFailed: false, ...base });

      if (!update.skipped && !this.notifiedVersions.has(update.version)) {
        this.notifiedVersions.add(update.version);
        this.deps.onUpdateFound(update);
      }
    } catch (error) {
      console.warn('[Clippo] Update check failed', error);
      const base = this.envelope(this.deps.now());
      this.setStatus(
        this.lastUpdate
          ? { state: 'available', update: this.lastUpdate, installFailed: false, ...base }
          : { state: 'error', ...base },
      );
    }
    return this.status;
  }

  private envelope(lastCheckedAt: number | null): Pick<UpdateStatus, 'currentVersion' | 'lastCheckedAt' | 'canInstall'> {
    return { currentVersion: this.deps.currentVersion, lastCheckedAt, canInstall: this.deps.installer !== null };
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.deps.onStatusChange(status);
  }
}

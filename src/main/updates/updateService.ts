import type { AvailableUpdate, UpdateStatus } from '../../shared/types';
import { pickDownloadUrl, type ReleaseSource } from './githubReleases';
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
  schedule: ScheduleFn;
  now: () => number;
  /** Read on every scheduled tick, so turning the setting off takes effect without a restart. */
  isAutoCheckEnabled: () => boolean;
  skippedVersion: () => string | undefined;
  onStatusChange: (status: UpdateStatus) => void;
  /** Called once per version per session, and never for a skipped version. */
  onUpdateFound: (update: AvailableUpdate) => void;
}

/**
 * Decides when to check for a new release and what the result means. It owns no Electron API:
 * the network, timers, clock, settings and notifications are injected, so every rule below is
 * unit tested without a real app, network or fake timers.
 */
export class UpdateService {
  private status: UpdateStatus;
  private inFlight: Promise<UpdateStatus> | null = null;
  private cancelTimer: (() => void) | null = null;
  private readonly notifiedVersions = new Set<string>();
  /** Last update found, kept so a later failed check (for example offline) does not hide it. */
  private lastUpdate: AvailableUpdate | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {
    this.status = { state: 'idle', currentVersion: deps.currentVersion, lastCheckedAt: null };
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
   * Concurrent calls share one request instead of firing several.
   */
  checkNow(): Promise<UpdateStatus> {
    this.inFlight ??= this.runCheck().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
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
    const { currentVersion, lastCheckedAt } = this.status;
    this.setStatus({ state: 'checking', currentVersion, lastCheckedAt });

    try {
      const release = await this.deps.source.latest();
      const checkedAt = this.deps.now();
      if (!release || !isNewerVersion(release.version, currentVersion)) {
        this.lastUpdate = null;
        this.setStatus({ state: 'up-to-date', currentVersion, lastCheckedAt: checkedAt });
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
      this.setStatus({ state: 'available', update, currentVersion, lastCheckedAt: checkedAt });

      if (!update.skipped && !this.notifiedVersions.has(update.version)) {
        this.notifiedVersions.add(update.version);
        this.deps.onUpdateFound(update);
      }
    } catch (error) {
      console.warn('[Clippo] Update check failed', error);
      const checkedAt = this.deps.now();
      this.setStatus(
        this.lastUpdate
          ? { state: 'available', update: this.lastUpdate, currentVersion, lastCheckedAt: checkedAt }
          : { state: 'error', currentVersion, lastCheckedAt: checkedAt },
      );
    }
    return this.status;
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.deps.onStatusChange(status);
  }
}

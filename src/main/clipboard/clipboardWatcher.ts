import type { ClipboardEntry, ClipboardEntryType } from '../../shared/types';
import { fingerprintClipboardImage, type ImageClipboardReader } from './imageFingerprint';

export interface WatchedClipboard extends ImageClipboardReader {
  readText(): string;
}

export interface ClipboardWatcherDeps {
  clipboard: WatchedClipboard;
  history: { insert(content: string, type: ClipboardEntryType, imageName?: string): ClipboardEntry };
  /** Persists the image currently on the clipboard and returns its file name. */
  saveImage: (fingerprint: string) => string | null;
  ignoredApps: () => readonly string[];
  /** Resolves the name of the frontmost application, without blocking the main thread. */
  frontmostAppName: () => Promise<string | null>;
  onNewEntry: (entry: ClipboardEntry) => void;
  platform?: string;
  logger?: Pick<Console, 'error'>;
}

/**
 * Watches the system clipboard for new text and images.
 *
 * Electron has no clipboard change notification, so we poll. The poll is designed to be close to
 * free when nothing changed: reading text and the format list is cheap, and images are compared
 * through a fingerprint of their raw bytes instead of being decoded and re-encoded each tick.
 * Ticks are chained with setTimeout so a slow tick can never overlap the next one.
 */
export class ClipboardWatcher {
  private lastText = '';
  private lastImageFingerprint: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private intervalMs = 500;

  constructor(private readonly deps: ClipboardWatcherDeps) {}

  start(intervalMs: number): void {
    if (this.running) return;
    this.intervalMs = intervalMs;
    this.running = true;
    this.rememberCurrentContent();
    this.scheduleNextTick();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  /** Applies immediately when idle; a tick in progress picks it up when it schedules the next one. */
  updateInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
    if (this.timer === null) return;
    this.clearTimer();
    this.scheduleNextTick();
  }

  /**
   * Must be called right after Clippo itself writes to the clipboard, so that pasting an
   * entry does not get recorded again as a brand new entry on the next tick.
   */
  rememberCurrentContent(): void {
    this.lastText = this.deps.clipboard.readText();
    this.lastImageFingerprint = this.fingerprint();
  }

  /** Runs one detection pass. Public so tests can drive the watcher without timers. */
  async checkNow(): Promise<void> {
    const imageFingerprint = this.fingerprint();
    if (imageFingerprint !== null && imageFingerprint !== this.lastImageFingerprint) {
      this.lastImageFingerprint = imageFingerprint;
      if (await this.copiedFromIgnoredApp()) return;
      const imageName = this.deps.saveImage(imageFingerprint);
      if (imageName) this.deps.onNewEntry(this.deps.history.insert(imageName, 'image', imageName));
      return;
    }

    const text = this.deps.clipboard.readText();
    if (!text || text === this.lastText) return;
    this.lastText = text;
    this.lastImageFingerprint = null; // The same image copied again later must be recorded.
    if (await this.copiedFromIgnoredApp()) return;
    this.deps.onNewEntry(this.deps.history.insert(text, 'text'));
  }

  private fingerprint(): string | null {
    return fingerprintClipboardImage(this.deps.clipboard, this.deps.platform);
  }

  private async copiedFromIgnoredApp(): Promise<boolean> {
    const ignoredApps = this.deps.ignoredApps();
    if (ignoredApps.length === 0) return false;
    const activeApp = (await this.deps.frontmostAppName())?.toLowerCase();
    return activeApp !== undefined && ignoredApps.some((app) => app.toLowerCase() === activeApp);
  }

  private scheduleNextTick(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.checkNow()
        .catch((error: unknown) => (this.deps.logger ?? console).error('[Clippo] Clipboard check failed', error))
        .finally(() => {
          if (this.running) this.scheduleNextTick();
        });
    }, this.intervalMs);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

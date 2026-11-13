import type { AccessibilityState } from '../../shared/types';

/** Cancels a scheduled task. */
export type Cancel = () => void;

/** Timer seam: production uses Node timers, tests run the tasks by hand. */
export interface Scheduler {
  every(intervalMs: number, task: () => void): Cancel;
  after(delayMs: number, task: () => void): Cancel;
}

export const nodeScheduler: Scheduler = {
  every(intervalMs, task) {
    const handle = setInterval(task, intervalMs);
    return () => clearInterval(handle);
  },
  after(delayMs, task) {
    const handle = setTimeout(task, delayMs);
    return () => clearTimeout(handle);
  },
};

/** While access is missing we poll quickly, so the warning clears within a moment of the grant. */
export const MISSING_POLL_MS = 2_000;
/** Safety net while access is granted, in case the system notification is not delivered. */
export const GRANTED_POLL_MS = 30_000;
/**
 * macOS posts the change notification slightly before the new value is readable, so an immediate
 * re-check would often still see the old value.
 */
export const SYSTEM_CHANGE_SETTLE_MS = 300;

export interface AccessibilityMonitorDeps {
  /** False on Linux and Windows: auto-paste is macOS only, so there is nothing to warn about. */
  isSupported: boolean;
  /** Reads the current trust state. Must be cheap and must not show any system prompt. */
  isTrusted: () => boolean;
  scheduler: Scheduler;
  /**
   * Subscribes to the system event fired when the Accessibility list changes, if the platform has
   * one. Returns an unsubscribe function.
   */
  subscribeToSystemChanges?: (listener: () => void) => Cancel;
}

type Listener = (state: AccessibilityState) => void;

/**
 * Single source of truth for "can Clippo paste into other apps right now?".
 *
 * macOS has no public callback for permission changes, so the state is refreshed:
 *  - when the monitor starts (app launch),
 *  - on the undocumented `com.apple.accessibility.api` notification (toggle, add, remove),
 *  - when the popup opens and after a failed paste (callers invoke `refresh()`),
 *  - by polling, fast while access is missing and slow while it is granted.
 *
 * Listeners are called only when the state actually changes, so the UI never re-renders for nothing.
 */
export class AccessibilityMonitor {
  private state: AccessibilityState;
  private readonly listeners = new Set<Listener>();
  private cancelPolling: Cancel | null = null;
  private pollingIntervalMs: number | null = null;
  private cancelSettle: Cancel | null = null;
  private unsubscribeSystem: Cancel | null = null;

  constructor(private readonly deps: AccessibilityMonitorDeps) {
    this.state = this.read();
  }

  get current(): AccessibilityState {
    return this.state;
  }

  /** Registers a listener for state changes. Returns a function that removes it. */
  onChange(listener: Listener): Cancel {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!this.deps.isSupported || this.unsubscribeSystem) return;
    this.unsubscribeSystem =
      this.deps.subscribeToSystemChanges?.(() => this.refreshAfterSettle()) ?? (() => undefined);
    this.refresh();
  }

  stop(): void {
    this.unsubscribeSystem?.();
    this.unsubscribeSystem = null;
    this.cancelSettle?.();
    this.cancelSettle = null;
    this.stopPolling();
  }

  /** Reads the permission now, notifies listeners if it changed, and returns the fresh state. */
  refresh(): AccessibilityState {
    const next = this.read();
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((listener) => listener(next));
    }
    if (this.unsubscribeSystem) this.schedulePolling();
    return next;
  }

  private read(): AccessibilityState {
    if (!this.deps.isSupported) return 'unsupported';
    return this.deps.isTrusted() ? 'granted' : 'missing';
  }

  private refreshAfterSettle(): void {
    this.cancelSettle?.();
    this.cancelSettle = this.deps.scheduler.after(SYSTEM_CHANGE_SETTLE_MS, () => {
      this.cancelSettle = null;
      this.refresh();
    });
  }

  private schedulePolling(): void {
    const intervalMs = this.state === 'missing' ? MISSING_POLL_MS : GRANTED_POLL_MS;
    if (intervalMs === this.pollingIntervalMs) return;
    this.stopPolling();
    this.pollingIntervalMs = intervalMs;
    this.cancelPolling = this.deps.scheduler.every(intervalMs, () => this.refresh());
  }

  private stopPolling(): void {
    this.cancelPolling?.();
    this.cancelPolling = null;
    this.pollingIntervalMs = null;
  }
}

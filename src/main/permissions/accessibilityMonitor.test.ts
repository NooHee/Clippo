import { describe, expect, it } from 'vitest';
import type { AccessibilityState } from '../../shared/types';
import {
  AccessibilityMonitor,
  GRANTED_POLL_MS,
  MISSING_POLL_MS,
  SYSTEM_CHANGE_SETTLE_MS,
  type Cancel,
  type Scheduler,
} from './accessibilityMonitor';

interface ScheduledTask {
  kind: 'every' | 'after';
  ms: number;
  task: () => void;
  cancelled: boolean;
}

/** Keeps scheduled tasks in a list so a test can run them on demand, without real or fake timers. */
class ManualScheduler implements Scheduler {
  readonly tasks: ScheduledTask[] = [];

  every(ms: number, task: () => void): Cancel {
    return this.add({ kind: 'every', ms, task, cancelled: false });
  }

  after(ms: number, task: () => void): Cancel {
    return this.add({ kind: 'after', ms, task, cancelled: false });
  }

  active(kind: ScheduledTask['kind']): ScheduledTask[] {
    return this.tasks.filter((entry) => entry.kind === kind && !entry.cancelled);
  }

  /** Runs the only active task of that kind, as if its timer had fired. */
  fire(kind: ScheduledTask['kind']): void {
    const [entry] = this.active(kind);
    if (!entry) throw new Error(`No active "${kind}" task`);
    if (kind === 'after') entry.cancelled = true;
    entry.task();
  }

  private add(entry: ScheduledTask): Cancel {
    this.tasks.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }
}

function setup(options: { trusted?: boolean; supported?: boolean } = {}) {
  let trusted = options.trusted ?? true;
  let systemListener: (() => void) | null = null;
  const scheduler = new ManualScheduler();
  const monitor = new AccessibilityMonitor({
    isSupported: options.supported ?? true,
    isTrusted: () => trusted,
    scheduler,
    subscribeToSystemChanges: (listener) => {
      systemListener = listener;
      return () => {
        systemListener = null;
      };
    },
  });
  const changes: AccessibilityState[] = [];
  monitor.onChange((state) => changes.push(state));

  return {
    monitor,
    scheduler,
    changes,
    setTrusted: (value: boolean) => {
      trusted = value;
    },
    emitSystemChange: () => systemListener?.(),
    isSubscribed: () => systemListener !== null,
  };
}

describe('AccessibilityMonitor', () => {
  it('reports unsupported off macOS and never schedules work', () => {
    const { monitor, scheduler, isSubscribed } = setup({ supported: false, trusted: false });

    monitor.start();

    expect(monitor.current).toBe('unsupported');
    expect(scheduler.tasks).toHaveLength(0);
    expect(isSubscribed()).toBe(false);
  });

  it('reads the initial state at construction', () => {
    expect(setup({ trusted: true }).monitor.current).toBe('granted');
    expect(setup({ trusted: false }).monitor.current).toBe('missing');
  });

  it('polls quickly while access is missing and clears the warning once it is granted', () => {
    const { monitor, scheduler, changes, setTrusted } = setup({ trusted: false });
    monitor.start();
    expect(scheduler.active('every').map((entry) => entry.ms)).toEqual([MISSING_POLL_MS]);

    setTrusted(true);
    scheduler.fire('every');

    expect(monitor.current).toBe('granted');
    expect(changes).toEqual(['granted']);
    expect(scheduler.active('every').map((entry) => entry.ms)).toEqual([GRANTED_POLL_MS]);
  });

  it('detects a revoked permission from the system notification after the settle delay', () => {
    const { monitor, scheduler, changes, setTrusted, emitSystemChange } = setup({ trusted: true });
    monitor.start();

    setTrusted(false);
    emitSystemChange();
    expect(changes).toEqual([]); // The new value is not read before macOS has written it.
    expect(scheduler.active('after').map((entry) => entry.ms)).toEqual([SYSTEM_CHANGE_SETTLE_MS]);

    scheduler.fire('after');

    expect(changes).toEqual(['missing']);
    expect(scheduler.active('every').map((entry) => entry.ms)).toEqual([MISSING_POLL_MS]);
  });

  it('coalesces bursts of system notifications into one check', () => {
    const { monitor, scheduler, emitSystemChange } = setup();
    monitor.start();

    emitSystemChange();
    emitSystemChange();
    emitSystemChange();

    expect(scheduler.active('after')).toHaveLength(1);
  });

  it('notifies listeners only when the state changes', () => {
    const { monitor, changes, setTrusted } = setup({ trusted: true });
    monitor.start();

    monitor.refresh();
    setTrusted(false);
    monitor.refresh();
    monitor.refresh();

    expect(changes).toEqual(['missing']);
  });

  it('lets a listener unsubscribe', () => {
    const { monitor, setTrusted } = setup({ trusted: true });
    const seen: AccessibilityState[] = [];
    const unsubscribe = monitor.onChange((state) => seen.push(state));

    unsubscribe();
    setTrusted(false);
    monitor.refresh();

    expect(seen).toEqual([]);
  });

  it('cancels polling, pending checks and the system subscription on stop', () => {
    const { monitor, scheduler, emitSystemChange, isSubscribed } = setup();
    monitor.start();
    emitSystemChange();

    monitor.stop();

    expect(scheduler.active('every')).toHaveLength(0);
    expect(scheduler.active('after')).toHaveLength(0);
    expect(isSubscribed()).toBe(false);
  });

  it('does not start polling when refresh is called before start', () => {
    const { monitor, scheduler } = setup({ trusted: false });

    monitor.refresh();

    expect(scheduler.tasks).toHaveLength(0);
  });
});

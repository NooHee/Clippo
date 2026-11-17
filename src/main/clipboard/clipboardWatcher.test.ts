import { describe, expect, it } from 'vitest';
import type { ClipboardEntry, ClipboardEntryType } from '../../shared/types';
import { MAX_TEXT_LENGTH } from '../../shared/types';
import { ClipboardWatcher, SENSITIVE_CLIPBOARD_TYPES, type WatchedClipboard } from './clipboardWatcher';
import type { ClipboardChangeListener, ClipboardChangeSource } from './clipboardChangeSource';

/** A clipboard the test can change at will. Tests call `checkNow()` directly: no timers. */
class FakeClipboard implements WatchedClipboard {
  text = '';
  png: Buffer | null = null;
  markers = new Set<string>();

  has(format: string): boolean {
    return this.markers.has(format);
  }
  textReads = 0;

  availableFormats(): string[] {
    return this.png ? ['image/png'] : ['text/plain'];
  }
  readBuffer(format: string): Buffer {
    return format === 'image/png' && this.png ? this.png : Buffer.alloc(0);
  }
  readImage() {
    return { isEmpty: () => true, toBitmap: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }) };
  }
  readText(): string {
    this.textReads++;
    return this.text;
  }
}

/** A change source the test triggers by hand, like the macOS change counter would. */
class FakeChangeSource implements ClipboardChangeSource {
  listener: ClipboardChangeListener | null = null;
  startedWith: number[] = [];
  stopped = 0;

  start(intervalMs: number, listener: ClipboardChangeListener): void {
    this.startedWith.push(intervalMs);
    this.listener = listener;
  }
  stop(): void {
    this.stopped++;
    this.listener = null;
  }
}

/** Lets pending promise callbacks (an in-flight check) run to completion. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
/** Long enough that no polling tick fires during a test. */
const NEVER_MS = 60_000;

function setup(options: { ignoredApps?: string[]; frontmost?: string | null; changeSource?: ClipboardChangeSource } = {}) {
  const clipboard = new FakeClipboard();
  const emitted: ClipboardEntry[] = [];
  let nextId = 1;
  const watcher = new ClipboardWatcher({
    clipboard,
    history: {
      insert: (content: string, type: ClipboardEntryType, imageName?: string): ClipboardEntry => ({
        id: nextId++,
        content,
        type,
        preview: content,
        createdAt: 0,
        pinnedAt: null,
        usageCount: 0,
        ...(imageName && { imageName }),
      }),
    },
    saveImage: (fingerprint) => `${fingerprint.slice(0, 6)}.png`,
    ignoredApps: () => options.ignoredApps ?? [],
    frontmostAppName: async () => options.frontmost ?? null,
    onNewEntry: (entry) => emitted.push(entry),
    changeSource: options.changeSource,
    logger: { error: () => undefined },
    platform: 'linux',
  });
  return { clipboard, emitted, watcher };
}

describe('ClipboardWatcher', () => {
  it('records new text once', async () => {
    const { clipboard, emitted, watcher } = setup();
    clipboard.text = 'hello';
    await watcher.checkNow();
    await watcher.checkNow();

    expect(emitted.map((entry) => entry.content)).toEqual(['hello']);
  });

  it('does not record what was on the clipboard before it started, or what Clippo wrote itself', async () => {
    const { clipboard, emitted, watcher } = setup();
    clipboard.text = 'already there';
    watcher.rememberCurrentContent();
    await watcher.checkNow();

    clipboard.text = 'pasted from Clippo';
    watcher.rememberCurrentContent();
    await watcher.checkNow();

    expect(emitted).toHaveLength(0);
  });

  it('records a new image once and the same image again after some text', async () => {
    const { clipboard, emitted, watcher } = setup();
    clipboard.png = Buffer.alloc(1_000, 1);
    await watcher.checkNow();
    await watcher.checkNow();

    clipboard.png = null;
    clipboard.text = 'text in between';
    await watcher.checkNow();

    clipboard.png = Buffer.alloc(1_000, 1);
    await watcher.checkNow();

    expect(emitted.map((entry) => entry.type)).toEqual(['image', 'text', 'image']);
  });

  it('skips entries copied from an ignored app (case-insensitive)', async () => {
    const { clipboard, emitted, watcher } = setup({ ignoredApps: ['1Password'], frontmost: '1password' });
    clipboard.text = 'secret';
    await watcher.checkNow();

    expect(emitted).toHaveLength(0);
  });

  it('keeps entries when the frontmost app cannot be determined', async () => {
    const { clipboard, emitted, watcher } = setup({ ignoredApps: ['1Password'], frontmost: null });
    clipboard.text = 'note';
    await watcher.checkNow();

    expect(emitted).toHaveLength(1);
  });

  describe('sensitive content', () => {
    it.each(SENSITIVE_CLIPBOARD_TYPES)('does not record text marked with %s', async (marker) => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.text = 'hunter2';
      clipboard.markers.add(marker);
      await watcher.checkNow();

      expect(emitted).toEqual([]);
    });

    it('does not record a concealed image', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.png = Buffer.from('secret QR code');
      clipboard.markers.add('org.nspasteboard.ConcealedType');
      await watcher.checkNow();

      expect(emitted).toEqual([]);
    });

    it('does not record the secret later if the marker goes away but the content stays', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.text = 'hunter2';
      clipboard.markers.add('org.nspasteboard.ConcealedType');
      await watcher.checkNow();
      clipboard.markers.clear();
      await watcher.checkNow();

      expect(emitted).toEqual([]);
    });

    it('records normally again once the user copies something else', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.text = 'hunter2';
      clipboard.markers.add('org.nspasteboard.ConcealedType');
      await watcher.checkNow();
      clipboard.markers.clear();
      clipboard.text = 'meeting notes';
      await watcher.checkNow();

      expect(emitted.map((entry) => entry.content)).toEqual(['meeting notes']);
    });

    it('treats a clipboard that cannot be queried as not sensitive', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.has = () => {
        throw new Error('unsupported format');
      };
      clipboard.text = 'hello';
      await watcher.checkNow();

      expect(emitted.map((entry) => entry.content)).toEqual(['hello']);
    });
  });

  describe('size limit', () => {
    it('records text up to the limit', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.text = 'a'.repeat(MAX_TEXT_LENGTH);
      await watcher.checkNow();

      expect(emitted).toHaveLength(1);
    });

    it('skips text above the limit without recording it on later ticks', async () => {
      const { clipboard, emitted, watcher } = setup();
      clipboard.text = 'a'.repeat(MAX_TEXT_LENGTH + 1);
      await watcher.checkNow();
      await watcher.checkNow();

      expect(emitted).toEqual([]);
    });
  });
});

describe('ClipboardWatcher with a change source', () => {
  it('reads nothing while the clipboard does not change', async () => {
    const changeSource = new FakeChangeSource();
    const { clipboard, watcher } = setup({ changeSource });
    watcher.start(250);
    const readsAfterStart = clipboard.textReads;
    await settle();

    expect(watcher.detectionMode).toBe('events');
    expect(changeSource.startedWith).toEqual([250]);
    expect(clipboard.textReads).toBe(readsAfterStart);
    watcher.stop();
  });

  it('records a copy as soon as the change source reports it', async () => {
    const changeSource = new FakeChangeSource();
    const { clipboard, emitted, watcher } = setup({ changeSource });
    watcher.start(250);

    clipboard.text = 'copied';
    changeSource.listener?.onChange();
    await settle();

    expect(emitted.map((entry) => entry.content)).toEqual(['copied']);
    watcher.stop();
  });

  it('coalesces a burst of changes into at most two checks that never overlap', async () => {
    const changeSource = new FakeChangeSource();
    const { clipboard, emitted, watcher } = setup({ changeSource });
    watcher.start(250);
    const readsAfterStart = clipboard.textReads;

    clipboard.text = 'last of the burst';
    for (let i = 0; i < 5; i++) changeSource.listener?.onChange();
    await settle();
    await settle();

    expect(clipboard.textReads - readsAfterStart).toBe(2);
    expect(emitted.map((entry) => entry.content)).toEqual(['last of the burst']);
    watcher.stop();
  });

  it('restarts the source with the new interval when the setting changes', () => {
    const changeSource = new FakeChangeSource();
    const { watcher } = setup({ changeSource });
    watcher.start(500);
    watcher.updateInterval(200);

    expect(changeSource.startedWith).toEqual([500, 200]);
    watcher.stop();
    expect(changeSource.stopped).toBeGreaterThan(0);
  });

  it('falls back to polling when the change source stops working', () => {
    const changeSource = new FakeChangeSource();
    const { watcher } = setup({ changeSource });
    watcher.start(NEVER_MS);

    changeSource.listener?.onUnavailable(new Error('helper crashed'));

    expect(watcher.detectionMode).toBe('polling');
    watcher.stop();
  });

  it('ignores a late failure report after it was stopped', () => {
    const changeSource = new FakeChangeSource();
    const { watcher } = setup({ changeSource });
    watcher.start(NEVER_MS);
    const { listener } = changeSource;
    watcher.stop();

    listener?.onUnavailable(new Error('killed on quit'));

    expect(watcher.detectionMode).toBe('events');
  });
});

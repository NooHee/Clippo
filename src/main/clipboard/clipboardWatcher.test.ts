import { describe, expect, it } from 'vitest';
import type { ClipboardEntry, ClipboardEntryType } from '../../shared/types';
import { ClipboardWatcher, type WatchedClipboard } from './clipboardWatcher';

/** A clipboard the test can change at will. Tests call `checkNow()` directly: no timers. */
class FakeClipboard implements WatchedClipboard {
  text = '';
  png: Buffer | null = null;

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
    return this.text;
  }
}

function setup(options: { ignoredApps?: string[]; frontmost?: string | null } = {}) {
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
});

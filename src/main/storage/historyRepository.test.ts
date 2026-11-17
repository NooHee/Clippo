import { describe, expect, it } from 'vitest';
import type { ClipboardEntry } from '../../shared/types';
import { InMemoryStore } from '../testing/inMemoryStore';
import {
  createEmptyHistory,
  HistoryRepository,
  MAX_RESULTS,
  parseHistoryData,
  SEARCH_TEXT_LENGTH,
  type HistoryData,
} from './historyRepository';

function setup(options: { maxHistory?: number } = {}) {
  let clock = 1_000;
  const store = new InMemoryStore<HistoryData>(createEmptyHistory());
  const removed: ClipboardEntry[] = [];
  const repository = new HistoryRepository(store, {
    maxHistory: () => options.maxHistory ?? 500,
    onEntryRemoved: (entry) => removed.push(entry),
    now: () => ++clock,
  });
  /** The full content of the listed rows (the list itself only carries previews). */
  const listedContents = (query?: string): (string | undefined)[] =>
    repository.list(query).map((row) => repository.find(row.id)?.content);
  return { store, repository, removed, listedContents };
}

describe('HistoryRepository', () => {
  it('inserts new entries at the top with a normalized preview', () => {
    const { repository, listedContents } = setup();
    repository.insert('first', 'text');
    const second = repository.insert('  second\n\nline  ', 'text');

    expect(second.preview).toBe('second line');
    expect(listedContents()).toEqual(['  second\n\nline  ', 'first']);
  });

  it('moves a re-copied entry to the top instead of duplicating it', () => {
    const { repository, listedContents } = setup();
    const original = repository.insert('hello', 'text');
    repository.insert('world', 'text');
    const again = repository.insert('hello', 'text');

    expect(again.id).toBe(original.id);
    expect(again.usageCount).toBe(1);
    expect(listedContents()).toEqual(['hello', 'world']);
  });

  it('lists pinned entries first, most recently pinned on top', () => {
    const { repository, listedContents } = setup();
    const a = repository.insert('a', 'text');
    const b = repository.insert('b', 'text');
    repository.insert('c', 'text');
    repository.togglePin(a.id);
    repository.togglePin(b.id);

    expect(listedContents()).toEqual(['b', 'a', 'c']);
  });

  it('searches case-insensitively in content and preview', () => {
    const { repository, listedContents } = setup();
    repository.insert('Hello World', 'text');
    repository.insert('something else', 'text');

    expect(listedContents('WORLD')).toEqual(['Hello World']);
    expect(repository.list('   ')).toHaveLength(2);
  });

  it('caps results sent to the renderer', () => {
    const { repository } = setup({ maxHistory: 1_000 });
    for (let i = 0; i < MAX_RESULTS + 10; i++) repository.insert(`entry ${i}`, 'text');

    expect(repository.list()).toHaveLength(MAX_RESULTS);
  });

  it('evicts the oldest unpinned entries beyond maxHistory and reports them for cleanup', () => {
    const { repository, removed, listedContents } = setup({ maxHistory: 2 });
    const pinned = repository.insert('pinned', 'text');
    repository.togglePin(pinned.id);
    repository.insert('image.png', 'image', 'image.png');
    repository.insert('b', 'text');
    repository.insert('c', 'text');

    expect(listedContents()).toEqual(['pinned', 'c', 'b']);
    expect(removed.map((entry) => entry.imageName)).toEqual(['image.png']);
  });

  it('marks an entry as used and moves it to the top', () => {
    const { repository } = setup();
    const a = repository.insert('a', 'text');
    repository.insert('b', 'text');
    repository.markUsed(a.id);

    const [top] = repository.list();
    expect(top.id).toBe(a.id);
    expect(repository.find(a.id)?.usageCount).toBe(1);
  });

  it('clears unpinned entries only and reports removed ones', () => {
    const { repository, removed, listedContents } = setup();
    const keep = repository.insert('keep', 'text');
    repository.togglePin(keep.id);
    repository.insert('drop', 'text');
    repository.clearUnpinned();

    expect(listedContents()).toEqual(['keep']);
    expect(removed.map((entry) => entry.content)).toEqual(['drop']);
  });

  it('requests a save for every mutation', () => {
    const { repository, store } = setup();
    const entry = repository.insert('a', 'text');
    repository.togglePin(entry.id);
    repository.delete(entry.id);

    expect(store.saveRequests).toBe(3);
  });

  it('ignores operations on unknown ids', () => {
    const { repository, store, removed } = setup();
    repository.delete(42);
    repository.togglePin(42);
    repository.markUsed(42);

    expect(store.saveRequests).toBe(0);
    expect(removed).toHaveLength(0);
  });

  it('lists previews only, never the full content', () => {
    const { repository } = setup();
    const entry = repository.insert('long line '.repeat(100), 'text');

    const [row] = repository.list();
    expect(row).toEqual({ id: entry.id, type: 'text', preview: entry.preview, createdAt: entry.createdAt, pinnedAt: null });
    expect(row.preview.length).toBeLessThanOrEqual(200);
  });


  it('searches the leading part of large entries only', () => {
    const { repository, listedContents } = setup();
    const head = `needle ${'a'.repeat(SEARCH_TEXT_LENGTH)}`;
    repository.insert(`${head} haystack`, 'text');

    expect(listedContents('needle')).toHaveLength(1);
    expect(listedContents('haystack')).toHaveLength(0);
  });

  it('keeps search results correct after an entry is re-copied, deleted or pinned', () => {
    const { repository, listedContents } = setup();
    const alpha = repository.insert('Alpha', 'text');
    repository.insert('beta', 'text');
    expect(listedContents('alp')).toEqual(['Alpha']);

    repository.insert('Alpha', 'text'); // moved to the top as a new object
    repository.togglePin(alpha.id);
    expect(listedContents('ALPHA')).toEqual(['Alpha']);

    repository.delete(alpha.id);
    expect(listedContents('alpha')).toEqual([]);
  });

  it('returns the updated row when pinning so the popup can move it locally', () => {
    const { repository } = setup();
    const entry = repository.insert('a', 'text');

    expect(repository.togglePin(entry.id)).toMatchObject({ id: entry.id, pinnedAt: expect.any(Number) });
    expect(repository.togglePin(entry.id)).toMatchObject({ id: entry.id, pinnedAt: null });
    expect(repository.togglePin(999)).toBeNull();
  });

  it('exports every entry with full content, beyond the list limit', () => {
    const { repository } = setup({ maxHistory: 1_000 });
    for (let i = 0; i < MAX_RESULTS + 5; i++) repository.insert(`entry ${i}`, 'text');

    const all = repository.all();
    expect(all).toHaveLength(MAX_RESULTS + 5);
    expect(all[0].content).toBe(`entry ${MAX_RESULTS + 4}`);
  });
});

describe('parseHistoryData', () => {
  it('drops malformed entries and repairs nextId', () => {
    const data = parseHistoryData({
      nextId: 2,
      entries: [
        { id: 7, content: 'ok', type: 'text', createdAt: 1 },
        { id: 'bad', content: 'x', type: 'text', createdAt: 1 },
        { id: 8, content: 'x', type: 'video', createdAt: 1 },
      ],
    });

    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ id: 7, pinnedAt: null, usageCount: 0, preview: 'ok' });
    expect(data.nextId).toBe(8);
  });

  it('rejects data that is not a history document', () => {
    expect(() => parseHistoryData({ foo: 1 })).toThrow();
  });
});

import type { ClipboardEntry, ClipboardEntrySummary, ClipboardEntryType } from '../../shared/types';
import type { DocumentStore } from './persistentJsonStore';
import { isFiniteNumber, isRecord, isString } from './guards';

export interface HistoryData {
  entries: ClipboardEntry[];
  nextId: number;
}

/** The renderer never needs more than this many rows at once. */
export const MAX_RESULTS = 200;
/** Search looks at this many leading characters of each entry, so a keystroke costs the same whatever was copied. */
export const SEARCH_TEXT_LENGTH = 20_000;
const PREVIEW_LENGTH = 200;
const ENTRY_TYPES: readonly ClipboardEntryType[] = ['text', 'image', 'file'];

export function isEntryType(value: unknown): value is ClipboardEntryType {
  return ENTRY_TYPES.some((type) => type === value);
}

function parseEntry(value: unknown): ClipboardEntry | null {
  if (!isRecord(value)) return null;
  const { id, content, type, preview, createdAt, pinnedAt, usageCount, imageName } = value;
  if (!isFiniteNumber(id) || !isString(content) || !isEntryType(type) || !isFiniteNumber(createdAt)) return null;
  return {
    id,
    content,
    type,
    preview: isString(preview) ? preview : buildPreview(content, type),
    createdAt,
    pinnedAt: isFiniteNumber(pinnedAt) ? pinnedAt : null,
    usageCount: isFiniteNumber(usageCount) ? usageCount : 0,
    ...(isString(imageName) && { imageName }),
  };
}

export function parseHistoryData(json: unknown): HistoryData {
  if (!isRecord(json) || !Array.isArray(json.entries)) throw new Error('Invalid history file');
  const entries = json.entries.map(parseEntry).filter((entry): entry is ClipboardEntry => entry !== null);
  const highestId = entries.reduce((max, entry) => Math.max(max, entry.id), 0);
  const nextId = isFiniteNumber(json.nextId) ? Math.max(json.nextId, highestId + 1) : highestId + 1;
  return { entries, nextId };
}

export function createEmptyHistory(): HistoryData {
  return { entries: [], nextId: 1 };
}

export function buildPreview(content: string, type: ClipboardEntryType): string {
  if (type === 'image') return '[Image]';
  if (type === 'file') return (content.split('\n', 1)[0] ?? content).slice(0, PREVIEW_LENGTH);
  return content.slice(0, PREVIEW_LENGTH).replace(/\s+/g, ' ').trim();
}

export function toSummary(entry: ClipboardEntry): ClipboardEntrySummary {
  const { id, type, preview, createdAt, pinnedAt, imageName } = entry;
  return { id, type, preview, createdAt, pinnedAt, ...(imageName && { imageName }) };
}

export interface HistoryRepositoryOptions {
  /** Read on every insert so a settings change applies immediately. */
  maxHistory: () => number;
  /** Lets the caller clean up side files (images) when an entry leaves the history. */
  onEntryRemoved?: (entry: ClipboardEntry) => void;
  now?: () => number;
}

/**
 * Clipboard history, newest first. Pure domain logic on top of a PersistentJsonStore:
 * it has no Electron dependency, which keeps it fast to unit test.
 */
export class HistoryRepository {
  private readonly now: () => number;
  /**
   * Lowercased, length capped text used by search, computed once per entry instead of on every
   * keystroke. Keyed by the entry object, so replacing or removing an entry drops its cache line
   * automatically and nothing extra is written to disk.
   */
  private readonly searchText = new WeakMap<ClipboardEntry, string>();

  constructor(
    private readonly store: DocumentStore<HistoryData>,
    private readonly options: HistoryRepositoryOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Loads the file now so the first popup open does not pay for disk I/O and decryption. */
  warmUp(): void {
    this.store.get();
  }

  /** Adds an entry, or moves an identical existing one to the top. */
  insert(content: string, type: ClipboardEntryType, imageName?: string): ClipboardEntry {
    const data = this.store.get();
    const existingIndex = data.entries.findIndex((entry) => entry.content === content);

    if (existingIndex !== -1) {
      const [existing] = data.entries.splice(existingIndex, 1);
      const updated: ClipboardEntry = { ...existing, createdAt: this.now(), usageCount: existing.usageCount + 1 };
      data.entries.unshift(updated);
      this.store.scheduleSave();
      return updated;
    }

    const entry: ClipboardEntry = {
      id: data.nextId++,
      content,
      type,
      preview: buildPreview(content, type),
      createdAt: this.now(),
      pinnedAt: null,
      usageCount: 0,
      ...(imageName && { imageName }),
    };
    data.entries.unshift(entry);
    this.prune(data);
    this.store.scheduleSave();
    return entry;
  }

  /** Pinned entries first (most recently pinned on top), then the rest by recency. */
  list(query = ''): ClipboardEntrySummary[] {
    const needle = query.trim().toLowerCase();
    const entries = this.store.get().entries;
    const matches = needle ? entries.filter((entry) => this.searchTextOf(entry).includes(needle)) : entries;

    const pinned = matches
      .filter((entry) => entry.pinnedAt !== null)
      .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
    const unpinned = matches.filter((entry) => entry.pinnedAt === null);
    return [...pinned, ...unpinned].slice(0, MAX_RESULTS).map(toSummary);
  }

  /** Every entry with its full content, newest first. Only for export. */
  all(): ClipboardEntry[] {
    return [...this.store.get().entries];
  }

  find(id: number): ClipboardEntry | undefined {
    return this.store.get().entries.find((entry) => entry.id === id);
  }

  contains(content: string): boolean {
    return this.store.get().entries.some((entry) => entry.content === content);
  }

  delete(id: number): void {
    const data = this.store.get();
    const removed = data.entries.filter((entry) => entry.id === id);
    if (removed.length === 0) return;
    data.entries = data.entries.filter((entry) => entry.id !== id);
    removed.forEach((entry) => this.options.onEntryRemoved?.(entry));
    this.store.scheduleSave();
  }

  /** Returns the updated row so the popup can move it locally instead of reloading the list. */
  togglePin(id: number): ClipboardEntrySummary | null {
    const entry = this.find(id);
    if (!entry) return null;
    entry.pinnedAt = entry.pinnedAt === null ? this.now() : null;
    this.store.scheduleSave();
    return toSummary(entry);
  }

  /** Removes everything except pinned entries. */
  clearUnpinned(): void {
    const data = this.store.get();
    const removed = data.entries.filter((entry) => entry.pinnedAt === null);
    data.entries = data.entries.filter((entry) => entry.pinnedAt !== null);
    removed.forEach((entry) => this.options.onEntryRemoved?.(entry));
    this.store.scheduleSave();
  }

  /** Records that the user pasted this entry and moves it to the top (unless pinned). */
  markUsed(id: number): void {
    const data = this.store.get();
    const index = data.entries.findIndex((entry) => entry.id === id);
    if (index === -1) return;
    const entry = data.entries[index];
    entry.usageCount += 1;
    if (entry.pinnedAt === null && index !== 0) {
      data.entries.splice(index, 1);
      data.entries.unshift(entry);
    }
    this.store.scheduleSave();
  }

  private searchTextOf(entry: ClipboardEntry): string {
    let text = this.searchText.get(entry);
    if (text === undefined) {
      text = `${entry.preview}\n${entry.content.slice(0, SEARCH_TEXT_LENGTH)}`.toLowerCase();
      this.searchText.set(entry, text);
    }
    return text;
  }

  private prune(data: HistoryData): void {
    const maxHistory = this.options.maxHistory();
    const unpinned = data.entries.filter((entry) => entry.pinnedAt === null);
    if (unpinned.length <= maxHistory) return;

    const evicted = new Set(unpinned.slice(maxHistory));
    data.entries = data.entries.filter((entry) => !evicted.has(entry));
    evicted.forEach((entry) => this.options.onEntryRemoved?.(entry));
  }
}

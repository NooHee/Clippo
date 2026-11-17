import type { ClipboardEntrySummary } from '../../shared/types';

/** Matches the number of rows the main process sends at most. */
export const MAX_VISIBLE_ENTRIES = 200;

/**
 * Moves a row after it was pinned or unpinned, using the same order as the main process:
 * pinned rows first (most recently pinned on top), then unpinned rows from newest to oldest.
 * Doing it locally avoids reloading and re-rendering the whole list on every pin click.
 */
export function applyPinChange(
  entries: readonly ClipboardEntrySummary[],
  updated: ClipboardEntrySummary,
): ClipboardEntrySummary[] {
  const others = entries.filter((entry) => entry.id !== updated.id);
  if (updated.pinnedAt !== null) return [updated, ...others];

  const firstOlder = others.findIndex((entry) => entry.pinnedAt === null && entry.createdAt < updated.createdAt);
  const insertAt = firstOlder === -1 ? others.length : firstOlder;
  return [...others.slice(0, insertAt), updated, ...others.slice(insertAt)];
}

/** Shows a newly copied (or re-copied) entry at the top of the list, without duplicating it. */
export function applyNewEntry(
  entries: readonly ClipboardEntrySummary[],
  entry: ClipboardEntrySummary,
): ClipboardEntrySummary[] {
  return [entry, ...entries.filter((existing) => existing.id !== entry.id)].slice(0, MAX_VISIBLE_ENTRIES);
}

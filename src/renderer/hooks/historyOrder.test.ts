import { describe, expect, it } from 'vitest';
import type { ClipboardEntrySummary } from '../../shared/types';
import { applyNewEntry, applyPinChange, MAX_VISIBLE_ENTRIES } from './historyOrder';

const row = (id: number, createdAt: number, pinnedAt: number | null = null): ClipboardEntrySummary => ({
  id,
  type: 'text',
  preview: `entry ${id}`,
  createdAt,
  pinnedAt,
});
const ids = (entries: ClipboardEntrySummary[]): number[] => entries.map((entry) => entry.id);

describe('applyPinChange', () => {
  it('moves a newly pinned row to the very top', () => {
    const entries = [row(1, 10, 100), row(2, 30), row(3, 20)];
    expect(ids(applyPinChange(entries, row(3, 20, 200)))).toEqual([3, 1, 2]);
  });

  it('puts an unpinned row back among unpinned rows by recency', () => {
    const entries = [row(1, 25, 200), row(2, 10, 100), row(3, 30), row(4, 20)];
    expect(ids(applyPinChange(entries, row(1, 25)))).toEqual([2, 3, 1, 4]);
  });

  it('appends an unpinned row older than everything', () => {
    const entries = [row(1, 5, 100), row(2, 30)];
    expect(ids(applyPinChange(entries, row(1, 5)))).toEqual([2, 1]);
  });
});

describe('applyNewEntry', () => {
  it('adds the entry on top without duplicating it, within the row limit', () => {
    const full = Array.from({ length: MAX_VISIBLE_ENTRIES }, (_, i) => row(i + 1, i));
    const updated = applyNewEntry(full, row(5, 1_000));

    expect(updated).toHaveLength(MAX_VISIBLE_ENTRIES);
    expect(updated[0].id).toBe(5);
    expect(ids(updated).filter((id) => id === 5)).toHaveLength(1);
  });
});

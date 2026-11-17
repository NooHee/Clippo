import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipboardEntrySummary } from '../../shared/types';
import { applyNewEntry, applyPinChange } from './historyOrder';

interface UseClipboardHistory {
  entries: ClipboardEntrySummary[];
  query: string;
  setQuery: (q: string) => void;
  /** Clears the search and reloads the list (no debounce). Used while the popup hides. */
  resetForNextOpen: () => Promise<void>;
  paste: (entry: ClipboardEntrySummary) => void;
  remove: (id: number) => void;
  pin: (id: number) => void;
  clearAll: () => void;
  loading: boolean;
}

export function useClipboardHistory(): UseClipboardHistory {
  const [entries, setEntries] = useState<ClipboardEntrySummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchHistory = useCallback(async (searchQuery = '') => {
    const results = await window.clipstack.getHistory(searchQuery);
    setEntries(results);
    setLoading(false);
  }, []);

  // Debounced search
  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchHistory(q);
    }, 150);
  }, [fetchHistory]);

  // Always reload: pasting moves the entry to the top on the main side, and the next open
  // should already show that order.
  const resetForNextOpen = useCallback(async () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    await fetchHistory('');
  }, [fetchHistory]);

  // Initial load
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Real-time updates from main process
  useEffect(() => {
    const unsubscribe = window.clipstack.onClipboardUpdated((newEntry) => {
      setEntries((prev) => applyNewEntry(prev, newEntry));
    });

    return unsubscribe;
  }, []);

  // The main process holds the content; the renderer only says which entry to paste.
  const paste = useCallback((entry: ClipboardEntrySummary) => {
    window.clipstack.pasteEntry(entry.id);
  }, []);

  const remove = useCallback(async (id: number) => {
    await window.clipstack.deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const pin = useCallback(async (id: number) => {
    const updated = await window.clipstack.pinEntry(id);
    setEntries((prev) => (updated ? applyPinChange(prev, updated) : prev.filter((e) => e.id !== id)));
  }, []);

  const clearAll = useCallback(async () => {
    await window.clipstack.clearHistory();
    setEntries((prev) => prev.filter((e) => e.pinnedAt !== null));
  }, []);

  return {
    entries,
    query,
    setQuery: handleQueryChange,
    resetForNextOpen,
    paste,
    remove,
    pin,
    clearAll,
    loading,
  };
}

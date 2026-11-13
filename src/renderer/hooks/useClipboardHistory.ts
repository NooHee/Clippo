import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipboardEntry } from '../../shared/types';

interface UseClipboardHistory {
  entries: ClipboardEntry[];
  query: string;
  setQuery: (q: string) => void;
  /** Clears the search and reloads the list (no debounce). Used while the popup hides. */
  resetForNextOpen: () => Promise<void>;
  paste: (entry: ClipboardEntry) => void;
  remove: (id: number) => void;
  pin: (id: number) => void;
  clearAll: () => void;
  loading: boolean;
}

export function useClipboardHistory(): UseClipboardHistory {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
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
      setEntries((prev) => {
        const filtered = prev.filter((e) => e.id !== newEntry.id);
        return [newEntry, ...filtered].slice(0, 200);
      });
    });

    return unsubscribe;
  }, []);

  const paste = useCallback((entry: ClipboardEntry) => {
    if (entry.type === 'image' && entry.imageName) {
      window.clipstack.pasteImage(entry.imageName);
    } else {
      window.clipstack.pasteEntry(entry.id, entry.content);
    }
  }, []);

  const remove = useCallback(async (id: number) => {
    await window.clipstack.deleteEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const pin = useCallback(async (id: number) => {
    await window.clipstack.pinEntry(id);
    await fetchHistory(query);
  }, [fetchHistory, query]);

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

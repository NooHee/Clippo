import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ClipboardEntry } from '../shared/types';
import { loadSettings } from './settings';
import { encrypt, decrypt, isAvailable } from './encrypting';
import { deleteImage } from './imageHandler';

// Pure JSON persistence — no native modules, works with any Node version.

interface Store {
  entries: ClipboardEntry[];
  nextId: number;
}

let _store: Store | null = null;

function getStorePath(): string {
  return path.join(app.getPath('userData'), 'clipstack-history.json');
}

function loadStore(): Store {
  if (_store) return _store;

  try {
    const raw = fs.readFileSync(getStorePath(), 'utf-8');
    if (isAvailable()) {
      const decrypted = decrypt(raw);
      if (decrypted !== null) {
        // Successfully decrypted — normal encrypted read
        _store = JSON.parse(decrypted) as Store;
      } else {
        // Migration: file is still plain JSON — parse and re-save encrypted
        _store = JSON.parse(raw) as Store;
        saveStore();
      }
    } else {
      _store = JSON.parse(raw) as Store;
    }
  } catch {
    _store = { entries: [], nextId: 1 };
  }

  return _store;
}

function saveStore(): void {
  if (!_store) return;
  const json = JSON.stringify(_store);
  const data = isAvailable() ? encrypt(json) : json;
  fs.writeFileSync(getStorePath(), data, 'utf-8');
}

export function insertEntry(content: string, type: ClipboardEntry['type'], imageName?: string): ClipboardEntry | null {
  const store = loadStore();
  const now = Date.now();

  const existingIndex = store.entries.findIndex((e) => e.content === content);

  if (existingIndex !== -1) {
    const existing = store.entries[existingIndex];
    const updated: ClipboardEntry = { ...existing, createdAt: now, usageCount: existing.usageCount + 1 };
    store.entries.splice(existingIndex, 1);
    store.entries.unshift(updated);
    saveStore();
    return updated;
  }

  const entry: ClipboardEntry = {
    id: store.nextId++,
    content,
    type,
    preview: buildPreview(content, type),
    createdAt: now,
    pinnedAt: null,
    usageCount: 0,
    ...(imageName && { imageName }),
  };

  store.entries.unshift(entry);
  pruneOldEntries();
  saveStore();

  return entry;
}

export function getHistory(query = ''): ClipboardEntry[] {
  const { entries } = loadStore();

  const filtered = query
    ? entries.filter((e) => e.content.toLowerCase().includes(query.toLowerCase()))
    : entries;

  const pinned = filtered.filter((e) => e.pinnedAt !== null).sort((a, b) => b.pinnedAt! - a.pinnedAt!);
  const unpinned = filtered.filter((e) => e.pinnedAt === null);

  return [...pinned, ...unpinned].slice(0, 200);
}

export function deleteEntry(id: number): void {
  const store = loadStore();
  const entry = store.entries.find((e) => e.id === id);

  // Delete associated image file if it exists
  if (entry && entry.type === 'image' && entry.imageName) {
    deleteImage(entry.imageName);
  }

  store.entries = store.entries.filter((e) => e.id !== id);
  saveStore();
}

export function togglePin(id: number): void {
  const store = loadStore();
  const entry = store.entries.find((e) => e.id === id);
  if (!entry) return;

  entry.pinnedAt = entry.pinnedAt ? null : Date.now();
  saveStore();
}

export function clearHistory(): void {
  const store = loadStore();
  const entriesToDelete = store.entries.filter((e) => e.pinnedAt === null);

  // Delete associated image files
  for (const entry of entriesToDelete) {
    if (entry.type === 'image' && entry.imageName) {
      deleteImage(entry.imageName);
    }
  }

  store.entries = store.entries.filter((e) => e.pinnedAt !== null);
  saveStore();
}

export function incrementUsage(id: number): void {
  const store = loadStore();
  const entry = store.entries.find((e) => e.id === id);
  if (!entry) return;

  entry.usageCount += 1;
  saveStore();
}

function pruneOldEntries(): void {
  if (!_store) return;

  const { maxHistory } = loadSettings();
  const pinned = _store.entries.filter((e) => e.pinnedAt !== null);
  const unpinned = _store.entries.filter((e) => e.pinnedAt === null).slice(0, maxHistory);

  _store.entries = [...pinned, ...unpinned];
}

function buildPreview(content: string, type: ClipboardEntry['type']): string {
  if (type === 'image') return '[Image]';
  if (type === 'file') return content.split('\n')[0] ?? content;
  return content.slice(0, 200).replace(/\s+/g, ' ').trim();
}

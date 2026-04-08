import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { ClipboardGroup, ClipboardEntryType, GroupEntry } from '../shared/types';

interface GroupStore {
  groups: ClipboardGroup[];
  nextGroupId: number;
  nextEntryId: number;
}

let _store: GroupStore | null = null;

function getPath(): string {
  return path.join(app.getPath('userData'), 'clipstack-groups.json');
}

function load(): GroupStore {
  if (_store) return _store;
  try {
    const raw = fs.readFileSync(getPath(), 'utf-8');
    _store = JSON.parse(raw) as GroupStore;
  } catch {
    _store = { groups: [], nextGroupId: 1, nextEntryId: 1 };
  }
  return _store;
}

function save(): void {
  if (!_store) return;
  fs.writeFileSync(getPath(), JSON.stringify(_store, null, 2), 'utf-8');
}

export function getGroups(): ClipboardGroup[] {
  return load().groups;
}

export function createGroup(name: string): ClipboardGroup {
  const store = load();
  const group: ClipboardGroup = {
    id: store.nextGroupId++,
    name: name.trim() || 'Untitled',
    createdAt: Date.now(),
    entries: [],
  };
  store.groups.push(group);
  save();
  return group;
}

export function deleteGroup(id: number): void {
  const store = load();
  store.groups = store.groups.filter((g) => g.id !== id);
  save();
}

export function renameGroup(id: number, name: string): void {
  const store = load();
  const group = store.groups.find((g) => g.id === id);
  if (!group) return;
  group.name = name.trim() || group.name;
  save();
}

export function addEntryToGroup(
  groupId: number,
  content: string,
  type: ClipboardEntryType,
  preview: string
): GroupEntry | null {
  const store = load();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return null;

  // Deduplicate within the group
  if (group.entries.some((e) => e.content === content)) return null;

  const entry: GroupEntry = {
    id: store.nextEntryId++,
    content,
    type,
    preview,
    addedAt: Date.now(),
  };
  group.entries.unshift(entry);
  save();
  return entry;
}

export function removeEntryFromGroup(groupId: number, entryId: number): void {
  const store = load();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return;
  group.entries = group.entries.filter((e) => e.id !== entryId);
  save();
}

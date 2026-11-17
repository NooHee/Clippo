import type { ClipboardEntryType, ClipboardGroup, ClipboardGroupSummary, GroupEntry, GroupEntrySummary } from '../../shared/types';
import type { DocumentStore } from './persistentJsonStore';
import { isFiniteNumber, isRecord, isString } from './guards';
import { isEntryType } from './historyRepository';

export interface GroupData {
  groups: ClipboardGroup[];
  nextGroupId: number;
  nextEntryId: number;
}

export function createEmptyGroups(): GroupData {
  return { groups: [], nextGroupId: 1, nextEntryId: 1 };
}

function parseGroupEntry(value: unknown): GroupEntry | null {
  if (!isRecord(value)) return null;
  const { id, content, type, preview, addedAt, imageName } = value;
  if (!isFiniteNumber(id) || !isString(content) || !isEntryType(type)) return null;
  return {
    id,
    content,
    type,
    preview: isString(preview) ? preview : content,
    addedAt: isFiniteNumber(addedAt) ? addedAt : 0,
    ...(isString(imageName) && { imageName }),
  };
}

function parseGroup(value: unknown): ClipboardGroup | null {
  if (!isRecord(value)) return null;
  const { id, name, createdAt, entries } = value;
  if (!isFiniteNumber(id) || !isString(name)) return null;
  return {
    id,
    name,
    createdAt: isFiniteNumber(createdAt) ? createdAt : 0,
    entries: Array.isArray(entries)
      ? entries.map(parseGroupEntry).filter((entry): entry is GroupEntry => entry !== null)
      : [],
  };
}

export function parseGroupData(json: unknown): GroupData {
  if (!isRecord(json) || !Array.isArray(json.groups)) throw new Error('Invalid groups file');
  const groups = json.groups.map(parseGroup).filter((group): group is ClipboardGroup => group !== null);
  const maxGroupId = groups.reduce((max, group) => Math.max(max, group.id), 0);
  const maxEntryId = groups.flatMap((group) => group.entries).reduce((max, entry) => Math.max(max, entry.id), 0);
  return {
    groups,
    nextGroupId: Math.max(isFiniteNumber(json.nextGroupId) ? json.nextGroupId : 0, maxGroupId + 1),
    nextEntryId: Math.max(isFiniteNumber(json.nextEntryId) ? json.nextEntryId : 0, maxEntryId + 1),
  };
}

function toGroupEntrySummary(entry: GroupEntry): GroupEntrySummary {
  const { id, type, preview, addedAt, imageName } = entry;
  return { id, type, preview, addedAt, ...(imageName && { imageName }) };
}

export class GroupRepository {
  constructor(
    private readonly store: DocumentStore<GroupData>,
    private readonly now: () => number = Date.now,
  ) {}

  /** Groups with entry previews only; the popup never needs the full content to render them. */
  list(): ClipboardGroupSummary[] {
    return this.store.get().groups.map((group) => ({ ...group, entries: group.entries.map(toGroupEntrySummary) }));
  }

  findEntry(groupId: number, entryId: number): GroupEntry | undefined {
    return this.find(groupId)?.entries.find((entry) => entry.id === entryId);
  }

  create(name: string): ClipboardGroupSummary {
    const data = this.store.get();
    const group: ClipboardGroup = {
      id: data.nextGroupId++,
      name: name.trim() || 'Untitled',
      createdAt: this.now(),
      entries: [],
    };
    data.groups.push(group);
    this.store.scheduleSave();
    return { ...group, entries: [] };
  }

  delete(id: number): void {
    const data = this.store.get();
    data.groups = data.groups.filter((group) => group.id !== id);
    this.store.scheduleSave();
  }

  rename(id: number, name: string): void {
    const group = this.find(id);
    if (!group) return;
    group.name = name.trim() || group.name;
    this.store.scheduleSave();
  }

  addEntry(
    groupId: number,
    content: string,
    type: ClipboardEntryType,
    preview: string,
    imageName?: string,
  ): GroupEntrySummary | null {
    const data = this.store.get();
    const group = this.find(groupId);
    if (!group || group.entries.some((entry) => entry.content === content)) return null;

    const entry: GroupEntry = {
      id: data.nextEntryId++,
      content,
      type,
      preview,
      addedAt: this.now(),
      ...(imageName && { imageName }),
    };
    group.entries.unshift(entry);
    this.store.scheduleSave();
    return toGroupEntrySummary(entry);
  }

  removeEntry(groupId: number, entryId: number): void {
    const group = this.find(groupId);
    if (!group) return;
    group.entries = group.entries.filter((entry) => entry.id !== entryId);
    this.store.scheduleSave();
  }

  private find(id: number): ClipboardGroup | undefined {
    return this.store.get().groups.find((group) => group.id === id);
  }
}

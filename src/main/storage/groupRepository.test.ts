import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../testing/inMemoryStore';
import { createEmptyGroups, GroupRepository, type GroupData } from './groupRepository';

function setup() {
  const store = new InMemoryStore<GroupData>(createEmptyGroups());
  return new GroupRepository(store, () => 1_000);
}

describe('GroupRepository', () => {
  it('lists groups with previews only and finds full entries by id', () => {
    const groups = setup();
    const group = groups.create('Snippets');
    const added = groups.addEntry(group.id, 'full content '.repeat(1_000), 'text', 'full content');

    const [listed] = groups.list();
    expect(listed.entries).toEqual([{ id: added?.id, type: 'text', preview: 'full content', addedAt: 1_000 }]);
    expect(groups.findEntry(group.id, added?.id ?? -1)?.content).toBe('full content '.repeat(1_000));
    expect(groups.findEntry(group.id, 999)).toBeUndefined();
  });

  it('does not add the same content twice to a group', () => {
    const groups = setup();
    const group = groups.create('Snippets');
    groups.addEntry(group.id, 'same', 'text', 'same');

    expect(groups.addEntry(group.id, 'same', 'text', 'same')).toBeNull();
  });
});

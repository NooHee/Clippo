import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';
import { InMemoryStore } from '../testing/inMemoryStore';
import { parseSettings, SettingsRepository } from './settingsRepository';
import { importHistory } from './historyImport';
import { createEmptyHistory, HistoryRepository } from './historyRepository';

describe('parseSettings', () => {
  it('fills missing fields with defaults', () => {
    expect(parseSettings({ theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('ignores values of the wrong type', () => {
    const parsed = parseSettings({ maxHistory: 'lots', pollIntervalMs: 1, popupPosition: 'center', ignoredApps: ['A', 3] });

    expect(parsed.maxHistory).toBe(DEFAULT_SETTINGS.maxHistory);
    expect(parsed.pollIntervalMs).toBe(DEFAULT_SETTINGS.pollIntervalMs);
    expect(parsed.popupPosition).toBe(DEFAULT_SETTINGS.popupPosition);
    expect(parsed.ignoredApps).toEqual(['A']);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseSettings('nope')).toThrow();
  });
});

describe('SettingsRepository', () => {
  it('applies a partial update and requests a save', () => {
    const store = new InMemoryStore<Settings>({ ...DEFAULT_SETTINGS });
    const repository = new SettingsRepository(store);

    expect(repository.update({ onboardingCompleted: true }).onboardingCompleted).toBe(true);
    expect(store.saveRequests).toBe(1);
  });
});

describe('importHistory', () => {
  it('imports valid items, counts duplicates and reports invalid ones', () => {
    const history = new HistoryRepository(new InMemoryStore(createEmptyHistory()), { maxHistory: () => 500 });
    history.insert('existing', 'text');

    const result = importHistory(history, [
      { content: 'new', type: 'text' },
      { content: 'existing', type: 'text' },
      { content: 'bad type', type: 'video' },
      42,
    ]);

    expect(result).toEqual({
      success: true,
      imported: 1,
      duplicates: 1,
      errors: ['Item 2: missing or invalid fields', 'Item 3: invalid structure'],
    });
  });

  it('rejects a file that is not an array', () => {
    const history = new HistoryRepository(new InMemoryStore(createEmptyHistory()), { maxHistory: () => 500 });
    expect(importHistory(history, {}).success).toBe(false);
  });
});

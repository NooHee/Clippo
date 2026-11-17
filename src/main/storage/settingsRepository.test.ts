import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_TEXT_LENGTH, PASSWORD_APPS, SETTINGS_LIMITS, type Settings } from '../../shared/types';
import { InMemoryStore } from '../testing/inMemoryStore';
import { parseSettings, SettingsRepository } from './settingsRepository';
import { importHistory } from './historyImport';
import { createEmptyHistory, HistoryRepository } from './historyRepository';

describe('parseSettings', () => {
  it('fills missing fields with defaults', () => {
    expect(parseSettings({ theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('ignores values of the wrong type', () => {
    const parsed = parseSettings({
      maxHistory: 'lots',
      popupPosition: 'center',
      ignoredApps: ['A', 3],
      passwordAppsAdded: true,
    });

    expect(parsed.maxHistory).toBe(DEFAULT_SETTINGS.maxHistory);
    expect(parsed.popupPosition).toBe(DEFAULT_SETTINGS.popupPosition);
    expect(parsed.ignoredApps).toEqual(['A']);
  });

  const outOfRange: Array<['maxHistory' | 'pollIntervalMs', number, number]> = [
    ['maxHistory', 0, SETTINGS_LIMITS.maxHistory.min],
    ['maxHistory', 1_000_000, SETTINGS_LIMITS.maxHistory.max],
    ['pollIntervalMs', 1, SETTINGS_LIMITS.pollIntervalMs.min],
    // Above 2^31 - 1 ms, setTimeout would fire every 1 ms instead.
    ['pollIntervalMs', 3_000_000_000, SETTINGS_LIMITS.pollIntervalMs.max],
  ];

  it.each(outOfRange)('clamps %s %d to %d', (field, value, expected) => {
    expect(parseSettings({ [field]: value })[field]).toBe(expected);
  });

  describe('password apps', () => {
    it('ignores password apps by default', () => {
      expect(DEFAULT_SETTINGS.ignoredApps).toEqual(PASSWORD_APPS);
    });

    it('adds them once to settings saved before they existed, keeping the user list', () => {
      const parsed = parseSettings({ ignoredApps: ['Slack', 'Bitwarden'] });

      expect(parsed.ignoredApps).toEqual(['Slack', 'Bitwarden', ...PASSWORD_APPS.filter((app) => app !== 'Bitwarden')]);
      expect(parsed.passwordAppsAdded).toBe(true);
    });

    it('keeps an app the user removed afterwards', () => {
      const withoutKeychain = PASSWORD_APPS.filter((app) => app !== 'Keychain Access');
      const parsed = parseSettings({ ignoredApps: withoutKeychain, passwordAppsAdded: true });

      expect(parsed.ignoredApps).toEqual(withoutKeychain);
    });
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

  it('skips items above the size limit', () => {
    const history = new HistoryRepository(new InMemoryStore(createEmptyHistory()), { maxHistory: () => 500 });
    const result = importHistory(history, [{ content: 'a'.repeat(MAX_TEXT_LENGTH + 1), type: 'text' }]);

    expect(result.imported).toBe(0);
    expect(result.errors).toEqual(['Item 0: too large']);
  });

  it('rejects a file that is not an array', () => {
    const history = new HistoryRepository(new InMemoryStore(createEmptyHistory()), { maxHistory: () => 500 });
    expect(importHistory(history, {}).success).toBe(false);
  });
});

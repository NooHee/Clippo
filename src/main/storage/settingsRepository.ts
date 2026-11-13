import { DEFAULT_SETTINGS, type Settings } from '../../shared/types';
import type { DocumentStore } from './persistentJsonStore';
import { isFiniteNumber, isRecord, isString } from './guards';

/**
 * Merges untrusted JSON (settings file, imported file, renderer payload) over the defaults,
 * keeping only fields with the expected type so a bad value can never crash the app.
 */
export function parseSettings(json: unknown): Settings {
  if (!isRecord(json)) throw new Error('Invalid settings');
  const settings: Settings = { ...DEFAULT_SETTINGS, ignoredApps: [...DEFAULT_SETTINGS.ignoredApps] };

  if (isString(json.hotkey) && json.hotkey.trim()) settings.hotkey = json.hotkey;
  if (isFiniteNumber(json.maxHistory) && json.maxHistory > 0) settings.maxHistory = Math.floor(json.maxHistory);
  if (typeof json.launchAtLogin === 'boolean') settings.launchAtLogin = json.launchAtLogin;
  if (isFiniteNumber(json.pollIntervalMs) && json.pollIntervalMs >= 100) settings.pollIntervalMs = json.pollIntervalMs;
  if (json.popupPosition === 'tray' || json.popupPosition === 'mouse') settings.popupPosition = json.popupPosition;
  if (typeof json.dismissOnBlur === 'boolean') settings.dismissOnBlur = json.dismissOnBlur;
  if (json.theme === 'light' || json.theme === 'dark' || json.theme === 'system') settings.theme = json.theme;
  if (Array.isArray(json.ignoredApps)) settings.ignoredApps = json.ignoredApps.filter(isString);
  if (json.language === 'en' || json.language === 'fr') settings.language = json.language;
  if (typeof json.onboardingCompleted === 'boolean') settings.onboardingCompleted = json.onboardingCompleted;

  return settings;
}

export class SettingsRepository {
  constructor(private readonly store: DocumentStore<Settings>) {}

  get(): Settings {
    return this.store.get();
  }

  save(settings: Settings): Settings {
    const next = parseSettings(settings);
    this.store.set(next);
    return next;
  }

  update(patch: Partial<Settings>): Settings {
    return this.save({ ...this.get(), ...patch });
  }
}

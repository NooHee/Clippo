import { DEFAULT_SETTINGS, PASSWORD_APPS, SETTINGS_LIMITS, type Settings } from '../../shared/types';
import type { DocumentStore } from './persistentJsonStore';
import { isFiniteNumber, isRecord, isString } from './guards';

function clamp(value: number, { min, max }: { readonly min: number; readonly max: number }): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Merges untrusted JSON (settings file, imported file, renderer payload) over the defaults,
 * keeping only fields with the expected type and range so a bad value can never crash the app.
 * Numbers are clamped rather than rejected: a value of 10,000 most likely means "as many as
 * possible", not "use the default".
 */
export function parseSettings(json: unknown): Settings {
  if (!isRecord(json)) throw new Error('Invalid settings');
  const settings: Settings = { ...DEFAULT_SETTINGS, ignoredApps: [...DEFAULT_SETTINGS.ignoredApps] };

  if (isString(json.hotkey) && json.hotkey.trim()) settings.hotkey = json.hotkey;
  if (isFiniteNumber(json.maxHistory)) settings.maxHistory = clamp(Math.floor(json.maxHistory), SETTINGS_LIMITS.maxHistory);
  if (typeof json.launchAtLogin === 'boolean') settings.launchAtLogin = json.launchAtLogin;
  // Without an upper bound, a huge value overflows setTimeout, which Node then runs every 1 ms.
  if (isFiniteNumber(json.pollIntervalMs)) settings.pollIntervalMs = clamp(json.pollIntervalMs, SETTINGS_LIMITS.pollIntervalMs);
  if (json.popupPosition === 'tray' || json.popupPosition === 'mouse') settings.popupPosition = json.popupPosition;
  if (typeof json.dismissOnBlur === 'boolean') settings.dismissOnBlur = json.dismissOnBlur;
  if (json.theme === 'light' || json.theme === 'dark' || json.theme === 'system') settings.theme = json.theme;
  if (Array.isArray(json.ignoredApps)) settings.ignoredApps = json.ignoredApps.filter(isString);
  if (json.language === 'en' || json.language === 'fr') settings.language = json.language;
  if (typeof json.onboardingCompleted === 'boolean') settings.onboardingCompleted = json.onboardingCompleted;

  // One-time migration: settings saved before the password app defaults existed get them added
  // once. After that the flag is stored, so an app the user removes stays removed.
  if (json.passwordAppsAdded !== true) {
    settings.ignoredApps = [...new Set([...settings.ignoredApps, ...PASSWORD_APPS])];
  }
  settings.passwordAppsAdded = true;

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

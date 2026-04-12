import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { encrypt, decrypt, isAvailable } from './encrypting';

let _settings: Settings | null = null;

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'clipstack-settings.json');
}

export function loadSettings(): Settings {
  if (_settings) return _settings;
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    if (isAvailable()) {
      const decrypted = decrypt(raw);
      if (decrypted !== null) {
        _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(decrypted) as Partial<Settings> };
      } else {
        // Migration: plain JSON — parse and re-save encrypted
        _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> };
        saveSettings(_settings);
      }
    } else {
      _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> };
    }
  } catch {
    _settings = { ...DEFAULT_SETTINGS };
  }
  return _settings;
}

export function saveSettings(settings: Settings): void {
  _settings = { ...settings };
  const json = JSON.stringify(settings, null, 2);
  const data = isAvailable() ? encrypt(json) : json;
  fs.writeFileSync(getSettingsPath(), data, 'utf-8');
}


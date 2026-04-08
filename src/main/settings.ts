import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

let _settings: Settings | null = null;

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'clipstack-settings.json');
}

export function loadSettings(): Settings {
  if (_settings) return _settings;
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf-8');
    _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<Settings> };
  } catch {
    _settings = { ...DEFAULT_SETTINGS };
  }
  return _settings;
}

export function saveSettings(settings: Settings): void {
  _settings = { ...settings };
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8');
}


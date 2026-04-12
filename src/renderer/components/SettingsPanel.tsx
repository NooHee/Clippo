import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';
import { changeLanguage } from '../../i18n';

interface Props {
  onClose: () => void;
}

function formatHotkey(hotkey: string): string {
  return hotkey
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Alt', '⌥')
    .replace('Shift', '⇧')
    .replace(/\+/g, '');
}

function captureHotkey(e: KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (e.metaKey) modifiers.push('Command');
  if (e.ctrlKey) modifiers.push('Control');
  if (e.altKey) modifiers.push('Alt');
  if (e.shiftKey) modifiers.push('Shift');

  if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return null;

  const keyMap: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
  };
  const key = keyMap[e.key] ?? e.key.toUpperCase();
  return [...modifiers, key].join('+');
}

export const SettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { translate } = useLocalization();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [importExportMsg, setImportExportMsg] = useState<string | null>(null);

  const skipNextSave = useRef(true);

  useEffect(() => {
    window.clipstack.getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const root = document.documentElement;
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme, loading]);

  useEffect(() => {
    if (loading) return;
    changeLanguage(settings.language);
  }, [settings.language, loading]);

  useEffect(() => {
    if (loading) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      await window.clipstack.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 600);
    return () => clearTimeout(timer);
  }, [settings, loading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return;
      e.preventDefault();
      if (e.key === 'Escape') {
        setRecording(false);
        e.stopPropagation();
        return;
      }
      const hotkey = captureHotkey(e);
      if (hotkey) {
        setSettings((s) => ({ ...s, hotkey }));
        setRecording(false);
      }
    },
    [recording]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  const handleExport = async () => {
    const result = await window.clipstack.exportSettings();
    if (result.success) {
      setImportExportMsg(translate('settings.exported'));
      setTimeout(() => setImportExportMsg(null), 2000);
    }
  };

  const handleImport = async () => {
    const imported = await window.clipstack.importSettings();
    if (!imported) return;
    setSettings({ ...DEFAULT_SETTINGS, ...imported });
    setImportExportMsg(translate('settings.imported'));
    setTimeout(() => setImportExportMsg(null), 2000);
  };

  if (loading) return null;

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <div className="settings-section-label">{translate('settings.sections.general')}</div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.theme.label')}</span>
          <div className="segmented">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.theme === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, theme: opt }))}
              >
                {translate(`settings.theme.${opt}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.language.label')}</span>
          <select
            className="settings-select"
            value={settings.language}
            onChange={(e) =>
              setSettings((s) => ({ ...s, language: e.target.value as 'en' | 'fr' }))
            }
          >
            <option value="en">{translate('settings.language.en')}</option>
            <option value="fr">{translate('settings.language.fr')}</option>
          </select>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.popupSize.label')}</span>
          <div className="segmented">
            {(['compact', 'normal', 'large'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.popupSize === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, popupSize: opt }))}
              >
                {translate(`settings.popupSize.${opt}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.launchAtLogin')}</span>
          <button
            className={`toggle ${settings.launchAtLogin ? 'on' : ''}`}
            onClick={() => setSettings((s) => ({ ...s, launchAtLogin: !s.launchAtLogin }))}
            role="switch"
            aria-checked={settings.launchAtLogin}
          >
            <span className="toggle-thumb" />
          </button>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.popupPosition.label')}</span>
          <div className="segmented">
            {(['tray', 'mouse'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.popupPosition === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, popupPosition: opt }))}
              >
                {opt === 'tray' ? translate('settings.popupPosition.tray') : translate('settings.popupPosition.mouse')}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.dismissOnBlur.label')}</span>
          <div className="segmented">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                className={`segmented-btn ${settings.dismissOnBlur === val ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, dismissOnBlur: val }))}
              >
                {val ? translate('settings.dismissOnBlur.auto') : translate('settings.dismissOnBlur.manual')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">{translate('settings.sections.hotkey')}</div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.globalShortcut')}</span>
          <button
            className={`hotkey-recorder ${recording ? 'recording' : ''}`}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
          >
            {recording ? translate('settings.pressKeys') : formatHotkey(settings.hotkey)}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">{translate('settings.sections.history')}</div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.maxItems')}</span>
          <input
            className="settings-number"
            type="number"
            min={10}
            max={5000}
            step={50}
            value={settings.maxHistory}
            onChange={(e) =>
              setSettings((s) => ({ ...s, maxHistory: Math.max(10, Number(e.target.value)) }))
            }
          />
        </div>
        <div className="settings-row">
          <span className="settings-row-label">{translate('settings.pollInterval.label')}</span>
          <select
            className="settings-select"
            value={settings.pollIntervalMs}
            onChange={(e) =>
              setSettings((s) => ({ ...s, pollIntervalMs: Number(e.target.value) }))
            }
          >
            <option value={250}>{translate('settings.pollInterval.fast')}</option>
            <option value={500}>{translate('settings.pollInterval.normal')}</option>
            <option value={1000}>{translate('settings.pollInterval.slow')}</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">{translate('settings.sections.privacy')}</div>
        <div className="settings-row-label" style={{ padding: '0 0 6px' }}>{translate('settings.ignoreApps')}</div>
        {settings.ignoredApps.map((app, i) => (
          <div key={i} className="ignored-app-row">
            <span className="ignored-app-name">{app}</span>
            <button
              className="ignored-app-remove"
              onClick={() => setSettings((s) => ({ ...s, ignoredApps: s.ignoredApps.filter((_, j) => j !== i) }))}
            >✕</button>
          </div>
        ))}
        <div className="ignored-app-add">
          <button
            className="ignored-app-add-btn"
            onClick={async () => {
              const name = await window.clipstack.browseForApp();
              if (name && !settings.ignoredApps.includes(name)) {
                setSettings((s) => ({ ...s, ignoredApps: [...s.ignoredApps, name] }));
              }
            }}
          >{translate('settings.addApp')}</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">{translate('settings.sections.backup')}</div>
        <div className="settings-import-export">
          <button className="settings-io-btn" onClick={handleImport}>{translate('settings.import')}</button>
          <button className="settings-io-btn" onClick={handleExport}>{translate('settings.export')}</button>
        </div>
        {importExportMsg && <p className="settings-io-msg">{importExportMsg}</p>}
      </div>

      <div className="settings-footer">
        <span className={`settings-autosave-status ${saved ? 'visible' : ''}`}>{translate('settings.saved')}</span>
        <button className="settings-cancel-btn" onClick={onClose}>{translate('settings.done')}</button>
      </div>
    </div>
  );
};

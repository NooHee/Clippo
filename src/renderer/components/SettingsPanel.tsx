import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [importExportMsg, setImportExportMsg] = useState<string | null>(null);

  // Skip autosave on the initial API load — only save user-initiated changes.
  const skipNextSave = useRef(true);

  useEffect(() => {
    window.clipstack.getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // Apply theme immediately when it changes
  useEffect(() => {
    if (loading) return;
    const root = document.documentElement;
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', settings.theme);
    }
  }, [settings.theme, loading]);

  // Autosave with 600ms debounce
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

  // Hotkey recorder — capture phase so Escape is handled before App's hide handler
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
      setImportExportMsg('Exported!');
      setTimeout(() => setImportExportMsg(null), 2000);
    }
  };

  const handleImport = async () => {
    const imported = await window.clipstack.importSettings();
    if (!imported) return;
    setSettings({ ...DEFAULT_SETTINGS, ...imported });
    setImportExportMsg('Imported!');
    setTimeout(() => setImportExportMsg(null), 2000);
  };

  if (loading) return null;

  return (
    <div className="settings-panel">
      <div className="settings-section">
        <div className="settings-section-label">General</div>
        <div className="settings-row">
          <span className="settings-row-label">Theme</span>
          <div className="segmented">
            {(['light', 'dark', 'system'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.theme === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, theme: opt }))}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">Popup size</span>
          <div className="segmented">
            {(['compact', 'normal', 'large'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.popupSize === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, popupSize: opt }))}
              >
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">Launch at login</span>
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
          <span className="settings-row-label">Show popup at</span>
          <div className="segmented">
            {(['tray', 'mouse'] as const).map((opt) => (
              <button
                key={opt}
                className={`segmented-btn ${settings.popupPosition === opt ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, popupPosition: opt }))}
              >
                {opt === 'tray' ? 'Tray icon' : 'Mouse cursor'}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">Dismiss on click away</span>
          <div className="segmented">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                className={`segmented-btn ${settings.dismissOnBlur === val ? 'active' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, dismissOnBlur: val }))}
              >
                {val ? 'Auto' : 'Manual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Hotkey</div>
        <div className="settings-row">
          <span className="settings-row-label">Global shortcut</span>
          <button
            className={`hotkey-recorder ${recording ? 'recording' : ''}`}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
          >
            {recording ? 'Press keys…' : formatHotkey(settings.hotkey)}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">History</div>
        <div className="settings-row">
          <span className="settings-row-label">Max items</span>
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
          <span className="settings-row-label">Poll interval</span>
          <select
            className="settings-select"
            value={settings.pollIntervalMs}
            onChange={(e) =>
              setSettings((s) => ({ ...s, pollIntervalMs: Number(e.target.value) }))
            }
          >
            <option value={250}>Fast (250ms)</option>
            <option value={500}>Normal (500ms)</option>
            <option value={1000}>Slow (1s)</option>
          </select>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Privacy</div>
        <div className="settings-row-label" style={{ padding: '0 0 6px' }}>Ignore apps</div>
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
          >+ Add app from Applications…</button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-label">Backup</div>
        <div className="settings-import-export">
          <button className="settings-io-btn" onClick={handleImport}>Import</button>
          <button className="settings-io-btn" onClick={handleExport}>Export</button>
        </div>
        {importExportMsg && <p className="settings-io-msg">{importExportMsg}</p>}
      </div>

      <div className="settings-footer">
        <span className={`settings-autosave-status ${saved ? 'visible' : ''}`}>✓ Saved</span>
        <button className="settings-cancel-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
};

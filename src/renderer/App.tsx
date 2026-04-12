import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../i18n/useLocalization';
import { changeLanguage } from '../i18n';
import { SearchBar } from './components/SearchBar';
import { ClipboardList } from './components/ClipboardList';
import { GroupsView } from './components/GroupsView';
import { GroupPicker } from './components/GroupPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { useClipboardHistory } from './hooks/useClipboardHistory';
import type { ClipboardEntry } from '../shared/types';
import './styles.css';

type Tab = 'history' | 'groups';

const App: React.FC = () => {
  const { translate } = useLocalization();
  const { entries, query, setQuery, paste, remove, pin, clearAll, loading } = useClipboardHistory();
  const [tab, setTab] = useState<Tab>('history');
  const [showSettings, setShowSettings] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<ClipboardEntry | null>(null);

  const applyTheme = useCallback(() => {
    window.clipstack.getSettings().then((s) => {
      const root = document.documentElement;
      if (s.theme === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', s.theme);
      }
    });
  }, []);

  const applyLanguage = useCallback(() => {
    window.clipstack.getSettings().then((s) => {
      changeLanguage(s.language);
    });
  }, []);

  useEffect(() => {
    applyTheme();
    applyLanguage();
  }, [applyTheme, applyLanguage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.clipstack.hideWindow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const unsubscribeHidden = window.clipstack.onWindowHidden(() => {
      window.clipstack.hideTooltip();
    });

    // Window is transparent (opacity=0) but still composited — reset state now
    // so Chromium paints the correct frame before the window actually hides.
    const unsubscribeWillHide = window.clipstack.onWindowWillHide(() => {
      setShowSettings(false);
      setPickerEntry(null);
      setTab('history');
      setQuery('');
      window.clipstack.hideTooltip();
    });

    return () => {
      unsubscribeHidden();
      unsubscribeWillHide();
    };
  }, []);

  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-name">{translate('app.name')}</span>
        <div className="titlebar-actions">
          {!showSettings && tab === 'history' && entries.some((e) => e.pinnedAt === null) && (
            <button className="header-btn" onClick={clearAll} title={translate('app.clearTitle')}>
              {translate('app.clear')}
            </button>
          )}
          <button
            className={`header-btn icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title={translate('app.settings')}
          >
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="header-btn close-btn"
            onClick={() => window.clipstack.hideWindow()}
            title={translate('app.close')}
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {showSettings ? (
        <SettingsPanel onClose={() => { setShowSettings(false); applyTheme(); applyLanguage(); }} />
      ) : (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              {translate('app.history')}
            </button>
            <button
              className={`tab-btn ${tab === 'groups' ? 'active' : ''}`}
              onClick={() => setTab('groups')}
            >
              {translate('app.groups')}
            </button>
          </div>

          {tab === 'history' ? (
            <>
              <div className="search-wrapper">
                <SearchBar value={query} onChange={setQuery} onClear={() => setQuery('')} />
              </div>
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <ClipboardList
                  entries={entries}
                  loading={loading}
                  onPaste={paste}
                  onDelete={remove}
                  onPin={pin}
                  onAddToGroup={setPickerEntry}
                />
                {pickerEntry && (
                  <GroupPicker
                    entry={pickerEntry}
                    onClose={() => setPickerEntry(null)}
                  />
                )}
              </div>
              <div className="footer">
                <span>{translate('app.items', { count: entries.length })}</span>
                <kbd>⌘⇧V</kbd>
              </div>
            </>
          ) : (
            <GroupsView />
          )}
        </>
      )}
    </div>
  );
};

export default App;

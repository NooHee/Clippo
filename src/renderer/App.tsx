import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../i18n/useLocalization';
import { changeLanguage } from '../i18n';
import { SearchBar } from './components/SearchBar';
import { ClipboardList } from './components/ClipboardList';
import { GroupsView } from './components/GroupsView';
import { GroupPicker } from './components/GroupPicker';
import { SettingsPanel } from './components/SettingsPanel';
import { UpdateBanner } from './components/UpdateBanner';
import { useClipboardHistory } from './hooks/useClipboardHistory';
import { useUpdateStatus } from './hooks/useUpdateStatus';
import { Settings, X } from 'lucide-react';
import type { ClipboardEntry } from '../shared/types';
import './styles.css';

type Tab = 'history' | 'groups';

const App: React.FC = () => {
  const { translate } = useLocalization();
  const { entries, query, setQuery, resetForNextOpen, paste, remove, pin, clearAll, loading } = useClipboardHistory();
  const updates = useUpdateStatus();
  const [tab, setTab] = useState<Tab>('history');
  const [showSettings, setShowSettings] = useState(false);
  const [pickerEntry, setPickerEntry] = useState<ClipboardEntry | null>(null);

  // One settings round trip on mount (and after the settings panel closes) instead of one per concern.
  const applyAppearance = useCallback(async () => {
    const settings = await window.clipstack.getSettings();
    const root = document.documentElement;
    if (settings.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', settings.theme);
    }
    changeLanguage(settings.language);
  }, []);

  useEffect(() => {
    void applyAppearance();
  }, [applyAppearance]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.clipstack.hideWindow();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Before the popup hides, reset the UI and confirm once that frame is painted, so the next
  // open shows a fresh view immediately instead of flashing the previous state.
  useEffect(() => {
    return window.clipstack.onPopupWillHide(async () => {
      setShowSettings(false);
      setPickerEntry(null);
      setTab('history');
      window.clipstack.hideTooltip();
      await resetForNextOpen();
      // Two frames: the first callback runs before the committed state is painted, the second after.
      requestAnimationFrame(() => requestAnimationFrame(() => window.clipstack.notifyPopupResetDone()));
    });
  }, [resetForNextOpen]);

  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-name">{translate('app.name')}</span>
        <div className="titlebar-actions">
          <button
            className={`header-btn icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title={translate('app.settings')}
          >
            <Settings size={16} strokeWidth={2} />
          </button>
          <button
            className="header-btn close-btn"
            onClick={() => window.clipstack.hideWindow()}
            title={translate('app.close')}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {showSettings ? (
        <SettingsPanel
          onClose={() => { setShowSettings(false); void applyAppearance(); }}
          onClearHistory={clearAll}
          updateStatus={updates.status}
          onCheckForUpdates={updates.checkNow}
        />
      ) : (
        <>
          <UpdateBanner status={updates.status} />
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

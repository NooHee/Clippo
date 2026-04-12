import React, { useRef, useEffect } from 'react';
import { useLocalization } from '../../i18n/useLocalization';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, onClear }) => {
  const { translate } = useLocalization();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="search-bar">
      <svg className="search-icon" viewBox="0 0 20 20" fill="none">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        placeholder={translate('search.placeholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (value) {
              onChange('');
            } else {
              window.clipstack.hideWindow();
            }
          }
        }}
      />

      {value && (
        <button className="clear-btn" onClick={onClear} aria-label={translate('app.clear')}>
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
};

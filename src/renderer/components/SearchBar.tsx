import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
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
      <Search className="search-icon" size={16} strokeWidth={1.5} />

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
          <X size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
};

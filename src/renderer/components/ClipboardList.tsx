import React from 'react';
import type { ClipboardEntry } from '../../shared/types';
import { ClipboardItem } from './ClipboardItem';
import { useLocalization } from '../../i18n/useLocalization';

interface ClipboardListProps {
  entries: ClipboardEntry[];
  loading: boolean;
  onPaste: (entry: ClipboardEntry) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onAddToGroup: (entry: ClipboardEntry) => void;
}

export const ClipboardList: React.FC<ClipboardListProps> = ({
  entries,
  loading,
  onPaste,
  onDelete,
  onPin,
  onAddToGroup,
}) => {
  const { translate } = useLocalization();

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 48 48" fill="none" className="empty-icon">
          <rect x="10" y="6" width="28" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M18 6v2a2 2 0 002 2h8a2 2 0 002-2V6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 20h16M16 27h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p>{translate('history.empty')}</p>
        <span>{translate('history.emptyHint')}</span>
      </div>
    );
  }

  const pinned = entries.filter((e) => e.pinnedAt !== null);
  const unpinned = entries.filter((e) => e.pinnedAt === null);

  return (
    <div className="clipboard-list">
      {pinned.length > 0 && (
        <div className="section">
          <div className="section-label">{translate('history.pinned')}</div>
          {pinned.map((entry) => (
            <ClipboardItem
              key={entry.id}
              entry={entry}
              onPaste={onPaste}
              onDelete={onDelete}
              onPin={onPin}
              onAddToGroup={onAddToGroup}
            />
          ))}
        </div>
      )}

      {unpinned.length > 0 && (
        <div className="section">
          {pinned.length > 0 && <div className="section-label">{translate('history.recent')}</div>}
          {unpinned.map((entry) => (
            <ClipboardItem
              key={entry.id}
              entry={entry}
              onPaste={onPaste}
              onDelete={onDelete}
              onPin={onPin}
              onAddToGroup={onAddToGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
};

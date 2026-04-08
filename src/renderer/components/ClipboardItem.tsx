import React, { useState } from 'react';
import type { ClipboardEntry } from '../../shared/types';

interface ClipboardItemProps {
  entry: ClipboardEntry;
  onPaste: (entry: ClipboardEntry) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onAddToGroup: (entry: ClipboardEntry) => void;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const ClipboardItem: React.FC<ClipboardItemProps> = ({
  entry,
  onPaste,
  onDelete,
  onPin,
  onAddToGroup,
}) => {
  const [hovered, setHovered] = useState(false);

  const isPinned = entry.pinnedAt !== null;

  return (
    <div
      className={`clipboard-item ${isPinned ? 'pinned' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPaste(entry)}
    >
      <div className="item-content">
        <p className="item-preview">{entry.preview}</p>
        <span className="item-time">{formatTimeAgo(entry.createdAt)}</span>
      </div>

      {hovered && (
        <div className="item-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="action-btn"
            onClick={() => onAddToGroup(entry)}
            title="Add to group"
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M3 7a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" stroke="currentColor" strokeWidth="1.3" />
              <path d="M10 10v4M8 12h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>

          <button
            className={`action-btn pin-btn ${isPinned ? 'active' : ''}`}
            onClick={() => onPin(entry.id)}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path
                d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5L10 2z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                fill={isPinned ? 'currentColor' : 'none'}
              />
            </svg>
          </button>

          <button
            className="action-btn delete-btn"
            onClick={() => onDelete(entry.id)}
            title="Delete"
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {isPinned && <div className="pin-indicator" />}
    </div>
  );
};

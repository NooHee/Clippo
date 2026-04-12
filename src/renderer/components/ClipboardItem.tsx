import React, { useState, useRef } from 'react';
import { FolderPlus, Pin, Trash2 } from 'lucide-react';
import type { ClipboardEntry } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

interface ClipboardItemProps {
  entry: ClipboardEntry;
  onPaste: (entry: ClipboardEntry) => void;
  onDelete: (id: number) => void;
  onPin: (id: number) => void;
  onAddToGroup: (entry: ClipboardEntry) => void;
}

export const ClipboardItem: React.FC<ClipboardItemProps> = ({
  entry,
  onPaste,
  onDelete,
  onPin,
  onAddToGroup,
}) => {
  const { translate } = useLocalization();

  function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return translate('history.justNow');
    if (seconds < 3600) return translate('history.minutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return translate('history.hoursAgo', { count: Math.floor(seconds / 3600) });
    return translate('history.daysAgo', { count: Math.floor(seconds / 86400) });
  }
  const [hovered, setHovered] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const overButtonsRef = useRef(false);

  const isPinned = entry.pinnedAt !== null;

  const isTruncated = () => {
    const el = previewRef.current;
    return el ? el.scrollWidth > el.clientWidth : false;
  };

  const handleMouseEnter = () => setHovered(true);
  const handleMouseLeave = () => {
    setHovered(false);
    overButtonsRef.current = false;
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    window.clipstack.hideTooltip();
  };
  const handleMouseMove = () => {
    if (!isTruncated() || overButtonsRef.current) return;
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      window.clipstack.showTooltip(entry.content);
    }, 500);
  };

  return (
    <div
      className={`clipboard-item ${isPinned ? 'pinned' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onClick={() => onPaste(entry)}
    >
      <div className="item-content">
        <p ref={previewRef} className="item-preview">{entry.preview}</p>
        <span className="item-time">{formatTimeAgo(entry.createdAt)}</span>
      </div>

      {hovered && (
        <div
          className="item-actions"
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => {
            overButtonsRef.current = true;
            if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
            window.clipstack.hideTooltip();
          }}
          onMouseLeave={() => {
            overButtonsRef.current = false;
          }}
        >
          <button
            className="action-btn"
            onClick={() => onAddToGroup(entry)}
            title={translate('actions.addToGroup')}
          >
            <FolderPlus size={16} strokeWidth={1.5} />
          </button>

          <button
            className={`action-btn pin-btn ${isPinned ? 'active' : ''}`}
            onClick={() => onPin(entry.id)}
            title={isPinned ? translate('actions.unpin') : translate('actions.pin')}
          >
            <Pin size={16} strokeWidth={1.5} fill={isPinned ? 'currentColor' : 'none'} />
          </button>

          <button
            className="action-btn delete-btn"
            onClick={() => onDelete(entry.id)}
            title={translate('actions.delete')}
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {isPinned && <div className="pin-indicator" />}
    </div>
  );
};

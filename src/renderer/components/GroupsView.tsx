import React, { useEffect, useState, useRef } from 'react';
import type { ClipboardGroup, GroupEntry } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

export const GroupsView: React.FC = () => {
  const { translate } = useLocalization();
  const [groups, setGroups] = useState<ClipboardGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<ClipboardGroup | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const newInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const data = await window.clipstack.getGroups();
    setGroups(data);
    if (activeGroup) {
      setActiveGroup(data.find((g) => g.id === activeGroup.id) ?? null);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (isCreating) newInputRef.current?.focus();
  }, [isCreating]);

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = async () => {
    if (!newName.trim()) { setIsCreating(false); return; }
    await window.clipstack.createGroup(newName.trim());
    setNewName('');
    setIsCreating(false);
    load();
  };

  const handleRename = async (id: number) => {
    if (editingName.trim()) await window.clipstack.renameGroup(id, editingName.trim());
    setEditingId(null);
    load();
  };

  const handleDelete = async (id: number) => {
    await window.clipstack.deleteGroup(id);
    if (activeGroup?.id === id) setActiveGroup(null);
    load();
  };

  const handlePaste = (content: string) => {
    window.clipstack.pasteGroupEntry(content);
  };

  const handleRemoveEntry = async (groupId: number, entryId: number) => {
    await window.clipstack.removeFromGroup(groupId, entryId);
    load();
  };

  // ── Group detail view ──────────────────────────────────────────────────────
  if (activeGroup) {
    return (
      <div className="groups-view">
        <div className="group-detail-header">
          <button className="group-back-btn" onClick={() => setActiveGroup(null)}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {editingId === activeGroup.id ? (
            <input
              ref={editInputRef}
              className="group-rename-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleRename(activeGroup.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(activeGroup.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
          ) : (
            <span
              className="group-detail-name"
              onClick={() => { setEditingId(activeGroup.id); setEditingName(activeGroup.name); }}
              title={translate('groups.clickToRename')}
            >
              {activeGroup.name}
            </span>
          )}
          <button
            className="group-delete-btn"
            onClick={() => handleDelete(activeGroup.id)}
            title={translate('groups.deleteGroup')}
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3h4v1M5 4v8h6V4H5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {activeGroup.entries.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 48 48" fill="none" className="empty-icon">
              <rect x="8" y="10" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 18h32" stroke="currentColor" strokeWidth="1.5" />
              <path d="M16 10V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M32 10V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p>{translate('groups.emptyGroup')}</p>
            <span>{translate('groups.emptyGroupHint')}</span>
          </div>
        ) : (
          <div className="clipboard-list">
            {activeGroup.entries.map((entry: GroupEntry) => (
              <GroupEntryItem
                key={entry.id}
                entry={entry}
                onPaste={() => handlePaste(entry.content)}
                onRemove={() => handleRemoveEntry(activeGroup.id, entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Groups list view ───────────────────────────────────────────────────────
  return (
    <div className="groups-view">
      {groups.length === 0 && !isCreating ? (
        <div className="empty-state">
          <svg viewBox="0 0 48 48" fill="none" className="empty-icon">
            <path d="M6 12a2 2 0 012-2h12l4 4h16a2 2 0 012 2v20a2 2 0 01-2 2H8a2 2 0 01-2-2V12z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <p>{translate('groups.empty')}</p>
          <span>{translate('groups.emptyHint')}</span>
        </div>
      ) : (
        <div className="clipboard-list">
          {groups.map((g) => (
            <div key={g.id} className="group-row" onClick={() => setActiveGroup(g)}>
              <svg className="group-row-icon" viewBox="0 0 16 16" fill="none">
                <path d="M2 5a1 1 0 011-1h4l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
              <div className="group-row-content">
                <span className="group-row-name">{g.name}</span>
                {g.entries.length > 0 && (
                  <span className="group-row-preview">{g.entries[g.entries.length - 1].preview}</span>
                )}
              </div>
              <span className="group-row-count">{g.entries.length}</span>
              <svg className="group-row-chevron" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="group-new-row">
          <input
            ref={newInputRef}
            className="group-new-input"
            placeholder={translate('groups.newGroupPlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setIsCreating(false); setNewName(''); }
            }}
            onBlur={handleCreate}
          />
        </div>
      )}

      <div className="groups-footer">
        <button className="group-new-btn" onClick={() => setIsCreating(true)}>
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {translate('groups.newGroup')}
        </button>
      </div>
    </div>
  );
};

const GroupEntryItem: React.FC<{
  entry: GroupEntry;
  onPaste: () => void;
  onRemove: () => void;
}> = ({ entry, onPaste, onRemove }) => {
  const { translate } = useLocalization();
  const [hovered, setHovered] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const overButtonsRef = useRef(false);

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
      className="clipboard-item"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onClick={onPaste}
    >
      <div className="item-content">
        <p ref={previewRef} className="item-preview">{entry.preview}</p>
        <span className="item-time">
          {new Date(entry.addedAt).toLocaleDateString()}
        </span>
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
            className="action-btn delete-btn"
            onClick={onRemove}
            title={translate('groups.removeFromGroup')}
          >
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

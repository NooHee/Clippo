import React, { useEffect, useRef, useState } from 'react';
import type { ClipboardEntry, ClipboardGroup } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

interface Props {
  entry: ClipboardEntry;
  onClose: () => void;
}

export const GroupPicker: React.FC<Props> = ({ entry, onClose }) => {
  const { translate } = useLocalization();
  const [groups, setGroups] = useState<ClipboardGroup[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [added, setAdded] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.clipstack.getGroups().then(setGroups);
  }, []);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const addTo = async (groupId: number) => {
    await window.clipstack.addToGroup(groupId, entry.content, entry.type, entry.preview);
    setAdded(groupId);
    setTimeout(onClose, 600);
  };

  const createAndAdd = async () => {
    if (!newName.trim()) { setCreating(false); return; }
    const group = await window.clipstack.createGroup(newName.trim());
    await addTo(group.id);
  };

  return (
    <>
      <div className="group-picker-backdrop" onClick={onClose} />
      <div className="group-picker">
        <div className="group-picker-header">{translate('groupPicker.title')}</div>

        {groups.length > 0 && (
          <div className="group-picker-list">
            {groups.map((g) => (
              <button
                key={g.id}
                className={`group-picker-item ${added === g.id ? 'added' : ''}`}
                onClick={() => addTo(g.id)}
                disabled={added !== null}
              >
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M2 5a1 1 0 011-1h4l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <span>{g.name}</span>
                {added === g.id && (
                  <svg className="picker-check" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}

        {creating ? (
          <div className="group-picker-new">
            <input
              ref={inputRef}
              className="group-new-input"
              placeholder={translate('groupPicker.newGroupPlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndAdd();
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
            />
          </div>
        ) : (
          <button className="group-picker-create" onClick={() => setCreating(true)}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {translate('groupPicker.newGroup')}
          </button>
        )}
      </div>
    </>
  );
};

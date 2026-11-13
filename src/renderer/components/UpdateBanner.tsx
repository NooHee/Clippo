import React from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import type { UpdateStatus } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

interface Props {
  status: UpdateStatus | null;
}

/** Slim banner above the history: only for a newer release the user has not skipped. */
export const UpdateBanner: React.FC<Props> = ({ status }) => {
  const { translate } = useLocalization();
  if (status?.state !== 'available' || status.update.skipped) return null;

  return (
    <div className="update-banner" role="status">
      <ArrowDownToLine size={14} strokeWidth={2} className="update-banner-icon" />
      <span className="update-banner-text">{translate('update.available', { version: status.update.version })}</span>
      <button className="update-banner-link" onClick={() => void window.clipstack.openUpdateLink('release-notes')}>
        {translate('update.releaseNotes')}
      </button>
      <button className="update-banner-btn" onClick={() => void window.clipstack.openUpdateLink('download')}>
        {translate('update.download')}
      </button>
      <button
        className="update-banner-dismiss"
        onClick={() => void window.clipstack.skipUpdate()}
        title={translate('update.skip')}
        aria-label={translate('update.skip')}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
};

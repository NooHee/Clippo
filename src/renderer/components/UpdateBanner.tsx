import React from 'react';
import { ArrowDownToLine, RefreshCw, X } from 'lucide-react';
import type { UpdateStatus } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

interface Props {
  status: UpdateStatus | null;
}

/**
 * Slim banner above the history. It offers a newer release the user has not skipped, then shows
 * the download progress and the restart once the user clicked Update.
 */
export const UpdateBanner: React.FC<Props> = ({ status }) => {
  const { translate } = useLocalization();

  switch (status?.state) {
    case 'downloading':
      return (
        <div className="update-banner" role="status">
          <ArrowDownToLine size={14} strokeWidth={2} className="update-banner-icon" />
          <div className="update-banner-progress-body">
            <span className="update-banner-text">
              {translate('update.downloading', { version: status.update.version, percent: status.percent })}
            </span>
            <div className="update-banner-progress" aria-hidden="true">
              <div className="update-banner-progress-fill" style={{ width: `${status.percent}%` }} />
            </div>
          </div>
        </div>
      );
    case 'installing':
      return (
        <div className="update-banner" role="status">
          <RefreshCw size={14} strokeWidth={2} className="update-banner-icon update-banner-spin" />
          <span className="update-banner-text">{translate('update.installing', { version: status.update.version })}</span>
        </div>
      );
    case 'available': {
      if (status.update.skipped) return null;
      const installInPlace = status.canInstall && !status.installFailed;
      const message = status.installFailed ? 'update.installFailed' : 'update.available';
      return (
        <div className="update-banner" role="status">
          <ArrowDownToLine size={14} strokeWidth={2} className="update-banner-icon" />
          <span className="update-banner-text" title={translate(message, { version: status.update.version })}>
            {translate(message, { version: status.update.version })}
          </span>
          <button className="update-banner-link" onClick={() => void window.clipstack.openUpdateLink('release-notes')}>
            {translate('update.releaseNotes')}
          </button>
          <button
            className="update-banner-btn"
            onClick={() => void (installInPlace ? window.clipstack.installUpdate() : window.clipstack.openUpdateLink('download'))}
          >
            {installInPlace ? translate('update.install') : translate('update.download')}
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
    }
    default:
      return null;
  }
};

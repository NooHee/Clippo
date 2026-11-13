import React, { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AccessibilityState } from '../../shared/types';
import { useLocalization } from '../../i18n/useLocalization';

interface Props {
  state: AccessibilityState | null;
}

/**
 * Persistent warning shown at the top of the popup (history, groups and settings) while Clippo
 * cannot paste into other apps. It has no close button on purpose: it disappears by itself as soon
 * as the main process sees the permission granted.
 */
export const AccessibilityBanner: React.FC<Props> = ({ state }) => {
  const { translate } = useLocalization();
  const [showSteps, setShowSteps] = useState(false);

  if (state !== 'missing') return null;

  return (
    <div className="accessibility-banner" role="alert">
      <TriangleAlert className="accessibility-banner-icon" size={16} strokeWidth={2} aria-hidden="true" />
      <div className="accessibility-banner-body">
        <strong className="accessibility-banner-title">{translate('accessibility.title')}</strong>
        <p>{translate('accessibility.impact')}</p>
        {showSteps && (
          <ol className="accessibility-banner-steps">
            <li>{translate('accessibility.steps.open')}</li>
            <li>{translate('accessibility.steps.stale')}</li>
            <li>{translate('accessibility.steps.autoClear')}</li>
          </ol>
        )}
        <div className="accessibility-banner-actions">
          <button className="accessibility-banner-primary" onClick={() => window.clipstack.openAccessibilitySettings()}>
            {translate('accessibility.openSettings')}
          </button>
          <button
            className="accessibility-banner-link"
            aria-expanded={showSteps}
            onClick={() => setShowSteps((visible) => !visible)}
          >
            {showSteps ? translate('accessibility.hideSteps') : translate('accessibility.showSteps')}
          </button>
        </div>
      </div>
    </div>
  );
};

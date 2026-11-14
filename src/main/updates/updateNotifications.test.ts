import { describe, expect, it } from 'vitest';
import type { AvailableUpdate } from '../../shared/types';
import { describeUpdateNotice } from './updateNotifications';

const update: AvailableUpdate = {
  version: '0.3.0',
  releaseUrl: 'https://github.com/NooHee/Clippo/releases/tag/v0.3.0',
  downloadUrl: 'https://github.com/NooHee/Clippo/releases/tag/v0.3.0',
  publishedAt: null,
  skipped: false,
};

describe('describeUpdateNotice', () => {
  it('says what a click does: update in place or download', () => {
    expect(describeUpdateNotice({ kind: 'available', update, canInstall: true }, 'en')).toEqual({
      title: 'Clippo 0.3.0 is available',
      body: 'Click to update. Clippo restarts on its own.',
    });
    expect(describeUpdateNotice({ kind: 'available', update, canInstall: false }, 'en').body).toBe(
      'Click to download the new version.',
    );
  });

  it('answers a manual check from the tray', () => {
    expect(describeUpdateNotice({ kind: 'up-to-date', currentVersion: '0.3.0' }, 'en').body).toContain('0.3.0');
    expect(describeUpdateNotice({ kind: 'check-failed' }, 'en').title).toBe('Could not check for updates');
  });

  it('follows the language setting', () => {
    expect(describeUpdateNotice({ kind: 'available', update, canInstall: true }, 'fr').title).toBe('Clippo 0.3.0 est disponible');
  });
});

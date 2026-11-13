import { Notification, systemPreferences } from 'electron';
import { openAccessibilitySettings } from '../platform/macos';

/**
 * Accessibility permission handling for auto-paste.
 *
 * Clippo is distributed unsigned (ad-hoc signature), so every new build has a different code
 * signature. macOS keeps showing the old Accessibility toggle as ON, but the grant belongs to the
 * previous binary and `isTrustedAccessibilityClient` returns false. The fix for the user is to
 * remove Clippo from the list with the minus button and add it again (or toggle it off and on).
 */
export class AccessibilityGuard {
  private promptedThisSession = false;

  isTrusted(): boolean {
    return systemPreferences.isTrustedAccessibilityClient(false);
  }

  /**
   * Asks macOS to show its own permission prompt once per session, and posts a notification that
   * explains the stale-toggle case, which the system prompt does not.
   */
  explain(): void {
    if (this.promptedThisSession) return;
    this.promptedThisSession = true;
    systemPreferences.isTrustedAccessibilityClient(true);

    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: 'Clippo copied the entry but could not paste it',
      body: 'Allow Clippo in Accessibility. If it is already on, remove it with the minus button and add it again (needed after each update).',
    });
    notification.on('click', () => void openAccessibilitySettings());
    notification.show();
  }
}

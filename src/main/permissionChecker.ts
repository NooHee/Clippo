import { safeStorage, systemPreferences } from 'electron';
import type { PermissionStatus } from '../shared/types';
import { frontmostAppName } from './platform/macos';

/**
 * Reports the macOS permissions Clippo relies on.
 *
 * Accessibility and Keychain use native Electron APIs (instant, no child process). Only the
 * System Events automation check needs AppleScript, and it runs asynchronously.
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') {
    return { keychain: safeStorage.isEncryptionAvailable(), systemEvents: false, accessibility: false };
  }
  return {
    keychain: safeStorage.isEncryptionAvailable(),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    systemEvents: (await frontmostAppName()) !== null,
  };
}

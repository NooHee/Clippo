import { execSync } from 'child_process';
import type { PermissionStatus } from '../shared/types';

/**
 * Check if the app has the required permissions on macOS
 */
export function checkPermissions(): PermissionStatus {
  return {
    keychain: safeCheck(checkKeychainAccess),
    systemEvents: safeCheck(checkSystemEventsAccess),
    accessibility: safeCheck(checkAccessibilityAccess),
  };
}

/**
 * Wrap permission checks in timeout to prevent hanging
 */
function safeCheck(check: () => boolean): boolean {
  try {
    return check();
  } catch (e) {
    console.error('[ClipStack] Permission check failed:', e);
    return false;
  }
}

/**
 * Check if we have keychain access by attempting a simple operation
 */
function checkKeychainAccess(): boolean {
  try {
    // Simple test: try to read keychain
    execSync('security show-keychain-info login.keychain 2>/dev/null', { timeout: 500, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we have System Events access via AppleScript
 */
function checkSystemEventsAccess(): boolean {
  try {
    execSync(`osascript -e 'tell application "System Events" to name'`, { timeout: 500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we have Accessibility access
 */
function checkAccessibilityAccess(): boolean {
  try {
    // Try a simple keystroke
    execSync(`osascript -e 'tell application "System Events" to keystroke ""'`, { timeout: 500 });
    return true;
  } catch {
    return false;
  }
}

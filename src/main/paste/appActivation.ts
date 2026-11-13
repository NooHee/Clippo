import { once } from 'node:events';
import type { App } from 'electron';

/**
 * Knows whether Clippo is the active (frontmost) macOS application and can give that status
 * back to whichever app had it before.
 */
export interface AppActivation {
  isActive(): boolean;
  /**
   * Deactivates Clippo. macOS then reactivates the previously active application and restores
   * its key window and first responder, which puts the caret back in the text field the user
   * was typing in.
   */
  yieldToPreviousApp(): void;
  /** Resolves true once Clippo is no longer active, or false after `timeoutMs`. */
  waitUntilInactive(timeoutMs: number): Promise<boolean>;
}

/**
 * Tracks activation through Electron's `did-become-active` / `did-resign-active` events, which map
 * directly to NSApplication notifications, so there is no polling and no guessing with timeouts.
 */
export class ElectronAppActivation implements AppActivation {
  private active = false;

  constructor(private readonly electronApp: App) {
    electronApp.on('did-become-active', () => {
      this.active = true;
    });
    electronApp.on('did-resign-active', () => {
      this.active = false;
    });
  }

  isActive(): boolean {
    return this.active;
  }

  yieldToPreviousApp(): void {
    // NSApplication.hide(_:) hands activation to the app that was active before Clippo.
    this.electronApp.hide();
  }

  async waitUntilInactive(timeoutMs: number): Promise<boolean> {
    if (!this.active) return true;
    try {
      await once(this.electronApp, 'did-resign-active', { signal: AbortSignal.timeout(timeoutMs) });
      return true;
    } catch {
      return false;
    }
  }
}

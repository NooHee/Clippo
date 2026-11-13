import type { PasteResult } from '../../shared/types';
import type { AppActivation } from './appActivation';

/** Upper bound for macOS to switch the active app. In practice it takes a few milliseconds. */
export const FOCUS_HANDBACK_TIMEOUT_MS = 500;

export interface PasteServiceDeps {
  /** Hides the popup; resolves once it is off screen. */
  hidePopup: () => Promise<void>;
  activation: AppActivation;
  /** Sends Cmd+V to the frontmost app; resolves false if it could not. */
  sendPasteKeystroke: () => Promise<boolean>;
  /**
   * Whether macOS lets Clippo synthesize keystrokes (Accessibility permission). Without it macOS
   * drops the events silently, so this must be checked up front rather than inferred afterwards.
   */
  hasAccessibilityPermission: () => boolean;
  /** Tells the user how to fix a missing or stale Accessibility permission. */
  onAccessibilityMissing: () => void;
  /**
   * Gives the previous app a moment to make its window key again after macOS reports that
   * Clippo resigned. Injected so tests never wait on real time.
   */
  waitForFocusToSettle: () => Promise<void>;
  /** Only macOS supports giving focus back and synthesizing the keystroke. */
  isAutoPasteSupported: boolean;
  logger?: Pick<Console, 'warn' | 'info'>;
}

/**
 * Orchestrates "click an entry, it lands in the text field I was typing in".
 *
 * The clipboard must already contain the entry when `pasteIntoPreviousApp` is called. Then:
 *  1. hide the popup,
 *  2. give activation back to the previous app (it restores its own focused text field),
 *  3. wait for macOS to confirm Clippo is no longer active (event driven, bounded by a timeout),
 *  4. send Cmd+V, which now goes to that previous app.
 *
 * The old implementation sent Cmd+V while Clippo itself was still the active application,
 * so the keystroke landed in Clippo's hidden window instead of the user's text field.
 */
export class PasteService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: PasteServiceDeps) {}

  /** Paste requests are serialized so a double click can never interleave two sequences. */
  pasteIntoPreviousApp(): Promise<PasteResult> {
    const run = this.queue.then(() => this.runPasteSequence());
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Closes the popup and returns focus to the previous app without pasting (Esc, close button). */
  async dismiss(): Promise<void> {
    await this.deps.hidePopup();
    await this.handFocusBack();
  }

  private async runPasteSequence(): Promise<PasteResult> {
    const { logger } = this.deps;
    await this.deps.hidePopup();
    if (!this.deps.isAutoPasteSupported) return 'copied';

    if (!this.deps.hasAccessibilityPermission()) {
      // Return focus anyway so the user can press Cmd+V right where they were.
      await this.handFocusBack();
      logger?.warn('[Clippo] Accessibility permission missing or stale, entry copied but not pasted.');
      this.deps.onAccessibilityMissing();
      return 'copied';
    }

    const focusReturned = await this.handFocusBack();
    if (!focusReturned) {
      // Sending Cmd+V now could paste into the wrong place; leaving it on the clipboard is safer.
      logger?.warn('[Clippo] Previous app did not regain focus in time, skipping auto-paste.');
      return 'copied';
    }
    await this.deps.waitForFocusToSettle();
    const sent = await this.deps.sendPasteKeystroke();
    logger?.info(`[Clippo] Paste ${sent ? 'sent' : 'failed'}.`);
    return sent ? 'pasted' : 'copied';
  }

  private async handFocusBack(): Promise<boolean> {
    const { activation } = this.deps;
    if (!activation.isActive()) return true; // The user already switched to another app.
    const becameInactive = activation.waitUntilInactive(FOCUS_HANDBACK_TIMEOUT_MS);
    activation.yieldToPreviousApp();
    return becameInactive;
  }
}

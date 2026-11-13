import { describe, expect, it } from 'vitest';
import type { AppActivation } from './appActivation';
import { FOCUS_HANDBACK_TIMEOUT_MS, PasteService, type PasteServiceDeps } from './pasteService';

/**
 * Records every side effect in order. No timers are involved: the fake activation resolves its
 * promise when `yieldToPreviousApp` is called, which is exactly what macOS does via the
 * did-resign-active notification.
 */
class FakeActivation implements AppActivation {
  readonly calls: string[];
  waitedWith: number | null = null;
  private resolveInactive: ((value: boolean) => void) | null = null;

  constructor(
    calls: string[],
    private active: boolean,
    private readonly regainsFocus = true,
  ) {
    this.calls = calls;
  }

  isActive(): boolean {
    return this.active;
  }

  yieldToPreviousApp(): void {
    this.calls.push('yield');
    if (this.regainsFocus) this.active = false;
    this.resolveInactive?.(this.regainsFocus);
  }

  waitUntilInactive(timeoutMs: number): Promise<boolean> {
    this.waitedWith = timeoutMs;
    return new Promise((resolve) => {
      this.resolveInactive = resolve;
    });
  }
}

function setup(overrides: { active?: boolean; regainsFocus?: boolean; keystrokeWorks?: boolean; mac?: boolean } = {}) {
  const calls: string[] = [];
  const activation = new FakeActivation(calls, overrides.active ?? true, overrides.regainsFocus ?? true);
  const deps: PasteServiceDeps = {
    hidePopup: async () => {
      calls.push('hide');
    },
    activation,
    sendPasteKeystroke: async () => {
      calls.push('keystroke');
      return overrides.keystrokeWorks ?? true;
    },
    isAutoPasteSupported: overrides.mac ?? true,
    logger: { warn: () => undefined },
  };
  return { calls, activation, service: new PasteService(deps) };
}

describe('PasteService', () => {
  it('hides the popup, hands focus back, then sends Cmd+V', async () => {
    const { service, calls, activation } = setup();

    await expect(service.pasteIntoPreviousApp()).resolves.toBe('pasted');
    expect(calls).toEqual(['hide', 'yield', 'keystroke']);
    expect(activation.waitedWith).toBe(FOCUS_HANDBACK_TIMEOUT_MS);
  });

  it('does not hide the app when the user already switched to another app', async () => {
    const { service, calls } = setup({ active: false });

    await expect(service.pasteIntoPreviousApp()).resolves.toBe('pasted');
    expect(calls).toEqual(['hide', 'keystroke']);
  });

  it('keeps the entry on the clipboard instead of pasting blindly if focus never came back', async () => {
    const { service, calls } = setup({ regainsFocus: false });

    await expect(service.pasteIntoPreviousApp()).resolves.toBe('copied');
    expect(calls).toEqual(['hide', 'yield']);
  });

  it('reports "copied" when the keystroke cannot be sent (no Accessibility permission)', async () => {
    const { service } = setup({ keystrokeWorks: false });

    await expect(service.pasteIntoPreviousApp()).resolves.toBe('copied');
  });

  it('only hides the popup on platforms without auto-paste support', async () => {
    const { service, calls } = setup({ mac: false });

    await expect(service.pasteIntoPreviousApp()).resolves.toBe('copied');
    expect(calls).toEqual(['hide']);
  });

  it('runs concurrent paste requests one after the other', async () => {
    const { service, calls } = setup({ active: false });

    await Promise.all([service.pasteIntoPreviousApp(), service.pasteIntoPreviousApp()]);
    expect(calls).toEqual(['hide', 'keystroke', 'hide', 'keystroke']);
  });

  it('dismiss hides and returns focus without pasting', async () => {
    const { service, calls } = setup();

    await service.dismiss();
    expect(calls).toEqual(['hide', 'yield']);
  });
});

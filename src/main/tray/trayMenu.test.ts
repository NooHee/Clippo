import { describe, expect, it, vi } from 'vitest';
import { describeTray, type TrayActions } from './trayMenu';

function actions(): TrayActions {
  return { toggle: vi.fn(), openAccessibilitySettings: vi.fn(), quit: vi.fn() };
}

describe('describeTray', () => {
  it('shows the plain menu when Accessibility is granted', () => {
    const tray = describeTray('granted', 'en', actions());

    expect(tray.title).toBe('');
    expect(tray.tooltip).toBe('Clippo');
    expect(tray.menu.map((item) => item.label ?? item.type)).toEqual(['Open Clippo', 'separator', 'Quit']);
  });

  it('shows nothing degraded off macOS', () => {
    const tray = describeTray('unsupported', 'en', actions());

    expect(tray.title).toBe('');
    expect(tray.menu).toHaveLength(3);
  });

  it('lists what is degraded and offers the fix when Accessibility is missing', () => {
    const trayActions = actions();
    const tray = describeTray('missing', 'en', trayActions);

    expect(tray.title).toBe('⚠︎');
    expect(tray.tooltip).toContain('auto-paste is off');
    const [header, detail, fix] = tray.menu;
    expect(header).toMatchObject({ enabled: false });
    expect(detail).toMatchObject({ enabled: false });
    expect(detail.label).toContain('⌘V');

    expect(fix.click).toBe(trayActions.openAccessibilitySettings);
  });

  it('follows the language setting', () => {
    const tray = describeTray('missing', 'fr', actions());

    expect(tray.menu.at(-1)?.label).toBe('Quitter');
    expect(tray.menu[2].label).toBe('Ouvrir les réglages Accessibilité…');
  });
});

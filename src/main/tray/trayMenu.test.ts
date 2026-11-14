import { describe, expect, it, vi } from 'vitest';
import type { AvailableUpdate, UpdateStatus } from '../../shared/types';
import { describeTray, type TrayActions } from './trayMenu';

function actions(): TrayActions {
  return {
    toggle: vi.fn(),
    openAccessibilitySettings: vi.fn(),
    installUpdate: vi.fn(),
    downloadUpdate: vi.fn(),
    checkForUpdates: vi.fn(),
    quit: vi.fn(),
  };
}

const update: AvailableUpdate = {
  version: '0.3.0',
  releaseUrl: 'https://github.com/NooHee/Clippo/releases/tag/v0.3.0',
  downloadUrl: 'https://github.com/NooHee/Clippo/releases/download/v0.3.0/Clippo-0.3.0-arm64-mac.zip',
  publishedAt: null,
  skipped: false,
};
const base = { currentVersion: '0.2.1', lastCheckedAt: 1, canInstall: true };

describe('describeTray', () => {
  it('shows the plain menu when Accessibility is granted', () => {
    const tray = describeTray('granted', 'en', actions());

    expect(tray.title).toBe('');
    expect(tray.tooltip).toBe('Clippo');
    expect(tray.menu.map((item) => item.label ?? item.type)).toEqual(['Open Clippo', 'Check for Updates…', 'separator', 'Quit']);
  });

  it('shows nothing degraded off macOS', () => {
    const tray = describeTray('unsupported', 'en', actions());

    expect(tray.title).toBe('');
    expect(tray.menu).toHaveLength(4);
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

describe('describeTray with updates', () => {
  const firstItem = (status: UpdateStatus, trayActions = actions()) => describeTray('granted', 'en', trayActions, status).menu[0];

  it('offers to update and restart when Clippo can install it', () => {
    const trayActions = actions();
    const item = firstItem({ ...base, state: 'available', update, installFailed: false }, trayActions);

    expect(item.label).toBe('Update to Clippo 0.3.0 and Restart');
    expect(item.click).toBe(trayActions.installUpdate);
  });

  it('offers the download when installing is not possible or failed', () => {
    const trayActions = actions();
    const cannot = firstItem({ ...base, canInstall: false, state: 'available', update, installFailed: false }, trayActions);
    const failed = firstItem({ ...base, state: 'available', update, installFailed: true }, trayActions);

    expect(cannot.label).toBe('Download Clippo 0.3.0…');
    expect(cannot.click).toBe(trayActions.downloadUpdate);
    expect(failed.click).toBe(trayActions.downloadUpdate);
  });

  it('shows progress while the update is applied', () => {
    expect(firstItem({ ...base, state: 'downloading', update, percent: 42 })).toMatchObject({
      label: 'Downloading Clippo 0.3.0… 42%',
      enabled: false,
    });
    expect(firstItem({ ...base, state: 'installing', update })).toMatchObject({ label: 'Installing Clippo 0.3.0…', enabled: false });
  });

  it('hides a skipped version and keeps the manual check', () => {
    const tray = describeTray('granted', 'en', actions(), { ...base, state: 'available', update: { ...update, skipped: true }, installFailed: false });
    expect(tray.menu.map((item) => item.label ?? item.type)).toEqual(['Open Clippo', 'Check for Updates…', 'separator', 'Quit']);
  });
});

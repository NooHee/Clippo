import { describe, expect, it } from 'vitest';
import { isAppUrl } from './webContentsGuard';

const PACKAGED = 'file:///Applications/Clippo.app/Contents/Resources/app.asar/dist/renderer/index.html';

describe('isAppUrl', () => {
  it('accepts the bundled page, with or without a hash or query', () => {
    expect(isAppUrl(PACKAGED, PACKAGED)).toBe(true);
    expect(isAppUrl(`${PACKAGED}#/settings`, PACKAGED)).toBe(true);
    expect(isAppUrl(`${PACKAGED}?tab=groups`, PACKAGED)).toBe(true);
  });

  it('accepts the dev server page in development', () => {
    expect(isAppUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
  });

  it('rejects another local file, such as a dropped HTML file', () => {
    expect(isAppUrl('file:///Users/me/Downloads/evil.html', PACKAGED)).toBe(false);
  });

  it('rejects remote pages and other ports', () => {
    expect(isAppUrl('https://example.com/', PACKAGED)).toBe(false);
    expect(isAppUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });

  it('rejects a missing or malformed URL', () => {
    expect(isAppUrl(undefined, PACKAGED)).toBe(false);
    expect(isAppUrl('', PACKAGED)).toBe(false);
    expect(isAppUrl('not a url', PACKAGED)).toBe(false);
  });
});

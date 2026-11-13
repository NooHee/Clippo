import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerVersion, normalizeVersion, parseVersion } from './version';

describe('parseVersion', () => {
  it('accepts plain, v-prefixed, pre-release and build metadata versions', () => {
    expect(parseVersion('0.3.0')).toEqual({ major: 0, minor: 3, patch: 0, prerelease: [] });
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parseVersion('1.0.0-beta.2+sha.abc')).toEqual({ major: 1, minor: 0, patch: 0, prerelease: ['beta', '2'] });
  });

  it.each(['', '1.2', '1.2.3.4', '01.2.3', 'latest', 'v', '1.2.3-'])('rejects %j', (text) => {
    expect(parseVersion(text)).toBeNull();
  });
});

describe('compareVersions', () => {
  // Every version is lower than the next one (ordering example from semver.org, section 11).
  const ordered = [
    '0.2.1',
    '0.2.10',
    '0.10.0',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];

  it.each(ordered.slice(1).map((version, i) => [ordered[i], version]))('%s < %s', (lower, higher) => {
    const a = parseVersion(lower);
    const b = parseVersion(higher);
    if (!a || !b) throw new Error('fixture must parse');
    expect(compareVersions(a, b)).toBeLessThan(0);
    expect(compareVersions(b, a)).toBeGreaterThan(0);
  });

  it('ignores build metadata', () => {
    const a = parseVersion('1.0.0+one');
    const b = parseVersion('1.0.0+two');
    if (!a || !b) throw new Error('fixture must parse');
    expect(compareVersions(a, b)).toBe(0);
  });
});

describe('isNewerVersion', () => {
  it('is true only for a strictly newer valid version', () => {
    expect(isNewerVersion('v0.3.0', '0.2.1')).toBe(true);
    expect(isNewerVersion('0.2.1', '0.2.1')).toBe(false);
    expect(isNewerVersion('0.2.0', '0.2.1')).toBe(false);
    expect(isNewerVersion('garbage', '0.2.1')).toBe(false);
    expect(isNewerVersion('0.3.0', 'garbage')).toBe(false);
  });
});

describe('normalizeVersion', () => {
  it('drops the v prefix and build metadata', () => {
    expect(normalizeVersion('v0.3.0')).toBe('0.3.0');
    expect(normalizeVersion('v1.0.0-rc.1+abc')).toBe('1.0.0-rc.1');
    expect(normalizeVersion('nope')).toBeNull();
  });
});

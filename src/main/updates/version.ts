/**
 * Minimal Semantic Versioning (https://semver.org) parsing and ordering.
 *
 * Only what update checks need: `MAJOR.MINOR.PATCH` with an optional `v` prefix, an optional
 * pre-release (`-beta.1`) and optional build metadata (`+sha`, ignored for ordering). Kept local
 * instead of pulling in the `semver` package so the main bundle stays dependency free.
 */
export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
}

const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function parseVersion(text: string): Version | null {
  const match = SEMVER.exec(text.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

const isNumeric = (identifier: string): boolean => /^\d+$/.test(identifier);

/** SemVer section 11: numeric identifiers compare numerically and sort before alphanumeric ones. */
function comparePrereleaseIdentifiers(a: string, b: string): number {
  if (isNumeric(a) && isNumeric(b)) return Number(a) - Number(b);
  if (isNumeric(a)) return -1;
  if (isNumeric(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Negative when `a < b`, positive when `a > b`, zero when they have the same precedence. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;

  // A version without a pre-release ranks above the same version with one (1.0.0 > 1.0.0-rc.1).
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const order = comparePrereleaseIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (order !== 0) return order;
  }
  return a.prerelease.length - b.prerelease.length;
}

/** True when `candidate` is a valid version strictly newer than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  return next !== null && installed !== null && compareVersions(next, installed) > 0;
}

/** `v0.3.0` becomes `0.3.0`; anything that is not a version yields null. */
export function normalizeVersion(text: string): string | null {
  const version = parseVersion(text);
  if (!version) return null;
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length ? `${core}-${version.prerelease.join('.')}` : core;
}

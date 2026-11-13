import { isRecord, isString } from '../storage/guards';
import { normalizeVersion } from './version';

/** The subset of a GitHub release the update checker uses, already validated. */
export interface LatestRelease {
  version: string;
  releaseUrl: string;
  publishedAt: string | null;
  assets: readonly ReleaseAsset[];
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

/** Where the latest published release comes from. Faked in unit tests. */
export interface ReleaseSource {
  /** Null when the repository has no published release yet. Rejects on network or API errors. */
  latest(): Promise<LatestRelease | null>;
}

/** Same shape as the WHATWG `fetch`, which Electron's `net.fetch` implements. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GitHubReleaseSourceOptions {
  owner: string;
  repo: string;
  /** GitHub rejects API requests without a User-Agent. */
  userAgent: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Only https links on github.com are ever handed to `shell.openExternal`. The response is
 * untrusted input, and opening an arbitrary URL (or a `file:` / custom scheme) from it would let
 * whoever controls the response launch things on the user's Mac.
 */
export function isTrustedGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

function parseAsset(json: unknown): ReleaseAsset | null {
  if (!isRecord(json) || !isString(json.name) || !isString(json.browser_download_url)) return null;
  if (!isTrustedGitHubUrl(json.browser_download_url)) return null;
  return { name: json.name, url: json.browser_download_url };
}

/**
 * Validates a `GET /repos/{owner}/{repo}/releases/latest` response.
 * Returns null for anything that is not a usable, published release.
 */
export function parseRelease(json: unknown): LatestRelease | null {
  if (!isRecord(json) || json.draft === true || json.prerelease === true) return null;
  if (!isString(json.tag_name) || !isString(json.html_url) || !isTrustedGitHubUrl(json.html_url)) return null;

  const version = normalizeVersion(json.tag_name);
  if (!version) return null;

  const assets = Array.isArray(json.assets)
    ? json.assets.map(parseAsset).filter((asset): asset is ReleaseAsset => asset !== null)
    : [];

  return {
    version,
    releaseUrl: json.html_url,
    publishedAt: isString(json.published_at) ? json.published_at : null,
    assets,
  };
}

/**
 * Picks the file a user of this Mac should download, following the names electron-builder gives
 * the release assets: `Clippo-X.Y.Z-arm64-mac.zip` for Apple Silicon and `Clippo-X.Y.Z.dmg` for
 * Intel. Falls back to the release page, which always works, when no asset matches.
 */
export function pickDownloadUrl(release: LatestRelease, arch: string): string {
  const isArm = arch === 'arm64';
  const matches = (asset: ReleaseAsset): boolean => {
    const name = asset.name.toLowerCase();
    const isArmBuild = name.includes('arm64');
    if (isArm !== isArmBuild) return false;
    return name.endsWith('.dmg') || name.endsWith('-mac.zip');
  };
  // A .dmg is the friendlier installer, so it wins when both exist for the architecture.
  const candidates = release.assets.filter(matches);
  const preferred = candidates.find((asset) => asset.name.toLowerCase().endsWith('.dmg')) ?? candidates[0];
  return preferred?.url ?? release.releaseUrl;
}

/**
 * Reads the latest release from the public GitHub REST API. No token is needed for a public
 * repository; unauthenticated calls are limited to 60 per hour per IP address.
 *
 * Conditional requests: the ETag of the last response is sent back as `If-None-Match`. When
 * nothing changed GitHub answers `304 Not Modified` with no body, and a 304 does not count
 * against the rate limit, so periodic checks are close to free.
 */
export class GitHubReleaseSource implements ReleaseSource {
  private etag: string | null = null;
  private cached: LatestRelease | null = null;

  constructor(private readonly options: GitHubReleaseSourceOptions) {}

  async latest(): Promise<LatestRelease | null> {
    const { owner, repo, userAgent, fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = this.options;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': userAgent,
    };
    if (this.etag) headers['If-None-Match'] = this.etag;

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 304) return this.cached;
    if (response.status === 404) {
      // No published release yet (drafts and pre-releases are not "latest").
      this.etag = null;
      this.cached = null;
      return null;
    }
    if (!response.ok) throw new Error(`GitHub API responded with HTTP ${response.status}`);

    const body: unknown = await response.json();
    const release = parseRelease(body);
    if (!release) throw new Error('GitHub API returned an unexpected release payload');

    this.etag = response.headers.get('etag');
    this.cached = release;
    return release;
  }
}

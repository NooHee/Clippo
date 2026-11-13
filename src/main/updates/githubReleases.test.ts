import { describe, expect, it } from 'vitest';
import {
  GitHubReleaseSource,
  isTrustedGitHubUrl,
  parseRelease,
  pickDownloadUrl,
  type FetchLike,
  type LatestRelease,
} from './githubReleases';

/** Trimmed copy of a real `releases/latest` response for this repository. */
function releaseJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v0.3.0',
    html_url: 'https://github.com/NooHee/Clippo/releases/tag/v0.3.0',
    draft: false,
    prerelease: false,
    published_at: '2026-11-20T10:00:00Z',
    assets: [
      {
        name: 'Clippo-0.3.0-arm64-mac.zip',
        browser_download_url: 'https://github.com/NooHee/Clippo/releases/download/v0.3.0/Clippo-0.3.0-arm64-mac.zip',
      },
      {
        name: 'Clippo-0.3.0.dmg',
        browser_download_url: 'https://github.com/NooHee/Clippo/releases/download/v0.3.0/Clippo-0.3.0.dmg',
      },
    ],
    ...overrides,
  };
}

describe('isTrustedGitHubUrl', () => {
  it('accepts only https links on github.com', () => {
    expect(isTrustedGitHubUrl('https://github.com/NooHee/Clippo/releases')).toBe(true);
    expect(isTrustedGitHubUrl('http://github.com/NooHee/Clippo')).toBe(false);
    expect(isTrustedGitHubUrl('https://github.com.evil.example/x')).toBe(false);
    expect(isTrustedGitHubUrl('file:///Applications/Calculator.app')).toBe(false);
    expect(isTrustedGitHubUrl('not a url')).toBe(false);
  });
});

describe('parseRelease', () => {
  it('extracts the version, page and assets', () => {
    const release = parseRelease(releaseJson());

    expect(release?.version).toBe('0.3.0');
    expect(release?.releaseUrl).toBe('https://github.com/NooHee/Clippo/releases/tag/v0.3.0');
    expect(release?.publishedAt).toBe('2026-11-20T10:00:00Z');
    expect(release?.assets.map((asset) => asset.name)).toEqual(['Clippo-0.3.0-arm64-mac.zip', 'Clippo-0.3.0.dmg']);
  });

  it('rejects drafts, pre-releases, bad tags and untrusted pages', () => {
    expect(parseRelease(releaseJson({ draft: true }))).toBeNull();
    expect(parseRelease(releaseJson({ prerelease: true }))).toBeNull();
    expect(parseRelease(releaseJson({ tag_name: 'nightly' }))).toBeNull();
    expect(parseRelease(releaseJson({ html_url: 'https://evil.example/release' }))).toBeNull();
    expect(parseRelease('not an object')).toBeNull();
  });

  it('drops assets that are malformed or hosted elsewhere', () => {
    const release = parseRelease(
      releaseJson({ assets: [{ name: 'x.dmg', browser_download_url: 'https://evil.example/x.dmg' }, { name: 3 }] }),
    );
    expect(release?.assets).toEqual([]);
  });
});

describe('pickDownloadUrl', () => {
  const release = parseRelease(releaseJson());
  if (!release) throw new Error('fixture must parse');

  it('gives Apple Silicon Macs the arm64 build', () => {
    expect(pickDownloadUrl(release, 'arm64')).toMatch(/Clippo-0\.3\.0-arm64-mac\.zip$/);
  });

  it('gives Intel Macs the x64 dmg', () => {
    expect(pickDownloadUrl(release, 'x64')).toMatch(/Clippo-0\.3\.0\.dmg$/);
  });

  it('prefers a dmg when the architecture has both formats', () => {
    const both: LatestRelease = {
      ...release,
      assets: [
        { name: 'Clippo-0.3.0-arm64-mac.zip', url: 'https://github.com/a.zip' },
        { name: 'Clippo-0.3.0-arm64.dmg', url: 'https://github.com/a.dmg' },
      ],
    };
    expect(pickDownloadUrl(both, 'arm64')).toBe('https://github.com/a.dmg');
  });

  it('falls back to the release page when no build matches', () => {
    expect(pickDownloadUrl({ ...release, assets: [] }, 'arm64')).toBe(release.releaseUrl);
  });
});

describe('GitHubReleaseSource', () => {
  interface Call {
    url: string;
    headers: Record<string, string>;
  }

  function sourceWith(responses: Response[]): { source: GitHubReleaseSource; calls: Call[] } {
    const calls: Call[] = [];
    const fetch: FetchLike = async (url, init) => {
      const headers = new Headers(init.headers);
      calls.push({ url, headers: Object.fromEntries(headers.entries()) });
      const next = responses.shift();
      if (!next) throw new Error('unexpected request');
      return next;
    };
    return { source: new GitHubReleaseSource({ owner: 'NooHee', repo: 'Clippo', userAgent: 'Clippo/0.2.1', fetch }), calls };
  }

  const ok = (body: unknown, etag = '"abc"'): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { etag } });

  it('calls the latest release endpoint with the API headers', async () => {
    const { source, calls } = sourceWith([ok(releaseJson())]);

    const release = await source.latest();

    expect(release?.version).toBe('0.3.0');
    expect(calls[0].url).toBe('https://api.github.com/repos/NooHee/Clippo/releases/latest');
    expect(calls[0].headers['user-agent']).toBe('Clippo/0.2.1');
    expect(calls[0].headers.accept).toBe('application/vnd.github+json');
    expect(calls[0].headers['if-none-match']).toBeUndefined();
  });

  it('sends the ETag back and reuses the cached release on 304 Not Modified', async () => {
    const { source, calls } = sourceWith([ok(releaseJson()), new Response(null, { status: 304 })]);

    const first = await source.latest();
    const second = await source.latest();

    expect(calls[1].headers['if-none-match']).toBe('"abc"');
    expect(second).toEqual(first);
  });

  it('returns null when the repository has no release yet', async () => {
    const { source } = sourceWith([new Response('{"message":"Not Found"}', { status: 404 })]);
    expect(await source.latest()).toBeNull();
  });

  it('rejects on rate limiting, server errors and unexpected payloads', async () => {
    const { source } = sourceWith([
      new Response('{}', { status: 403 }),
      new Response('{}', { status: 502 }),
      ok({ unexpected: true }),
    ]);
    await expect(source.latest()).rejects.toThrow('HTTP 403');
    await expect(source.latest()).rejects.toThrow('HTTP 502');
    await expect(source.latest()).rejects.toThrow('unexpected release payload');
  });
});

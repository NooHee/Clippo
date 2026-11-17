import { describe, expect, it } from 'vitest';
import { parseThumbnailUrl, thumbnailUrl } from './thumbnailUrl';

describe('thumbnail URLs', () => {
  it('round trips an image name', () => {
    const name = '1700000000000_abcdef012345.png';
    expect(thumbnailUrl(name)).toBe(`clippo-image://thumbnail/${name}`);
    expect(parseThumbnailUrl(thumbnailUrl(name))).toBe(name);
  });

  it('rejects other schemes, hosts and empty or malformed names', () => {
    expect(parseThumbnailUrl('file:///etc/passwd')).toBeNull();
    expect(parseThumbnailUrl('clippo-image://original/a.png')).toBeNull();
    expect(parseThumbnailUrl('clippo-image://thumbnail/')).toBeNull();
    expect(parseThumbnailUrl('clippo-image://thumbnail/%E0%A4%A')).toBeNull();
    expect(parseThumbnailUrl('not a url')).toBeNull();
  });

  it('keeps an encoded path separator inside the name, where ImageStore rejects it', () => {
    expect(parseThumbnailUrl('clippo-image://thumbnail/..%2F..%2Fsecret.png')).toBe('../../secret.png');
  });
});

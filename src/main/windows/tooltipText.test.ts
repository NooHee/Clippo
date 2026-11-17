import { describe, expect, it } from 'vitest';
import { parseTooltipTarget, TOOLTIP_MAX_CHARS, truncateForTooltip } from './tooltipText';

describe('truncateForTooltip', () => {
  it('keeps short text as is and cuts long text with an ellipsis', () => {
    expect(truncateForTooltip('short')).toBe('short');
    const long = truncateForTooltip('x'.repeat(1_000_000));
    expect(long).toHaveLength(TOOLTIP_MAX_CHARS + 1);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('parseTooltipTarget', () => {
  it('accepts history and group targets', () => {
    expect(parseTooltipTarget({ kind: 'history', id: 3 })).toEqual({ kind: 'history', id: 3 });
    expect(parseTooltipTarget({ kind: 'group', groupId: 1, entryId: 2, extra: true })).toEqual({
      kind: 'group',
      groupId: 1,
      entryId: 2,
    });
  });

  it('rejects anything else coming from the renderer', () => {
    for (const bad of ['some text', null, { kind: 'history' }, { kind: 'group', groupId: 1 }, { kind: 'file', id: 1 }]) {
      expect(() => parseTooltipTarget(bad)).toThrow(TypeError);
    }
  });
});

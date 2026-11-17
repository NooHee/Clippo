import { isFiniteNumber, isRecord } from '../storage/guards';
import type { TooltipTarget } from '../../shared/types';

/**
 * A hover preview shows about 25 lines in a 420 by 460 window. Sending more only makes the
 * tooltip renderer lay out text nobody can see (a copied 1 MB log used to be sent whole).
 */
export const TOOLTIP_MAX_CHARS = 8_000;

export function truncateForTooltip(content: string): string {
  return content.length > TOOLTIP_MAX_CHARS ? `${content.slice(0, TOOLTIP_MAX_CHARS)}…` : content;
}

/** Validates a tooltip request coming from the renderer. */
export function parseTooltipTarget(value: unknown): TooltipTarget {
  if (isRecord(value)) {
    if (value.kind === 'history' && isFiniteNumber(value.id)) return { kind: 'history', id: value.id };
    if (value.kind === 'group' && isFiniteNumber(value.groupId) && isFiniteNumber(value.entryId)) {
      return { kind: 'group', groupId: value.groupId, entryId: value.entryId };
    }
  }
  throw new TypeError('Invalid tooltip target');
}

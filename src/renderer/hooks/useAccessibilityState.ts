import { useEffect, useState } from 'react';
import type { AccessibilityState } from '../../shared/types';

/**
 * Live Accessibility permission state, pushed by the main process.
 * `null` until the first answer arrives, so nothing flashes on startup.
 */
export function useAccessibilityState(): AccessibilityState | null {
  const [state, setState] = useState<AccessibilityState | null>(null);

  useEffect(() => {
    let active = true;
    // Subscribe before asking, so a change that happens in between is not lost.
    const unsubscribe = window.clipstack.onAccessibilityChanged(setState);
    void window.clipstack.getAccessibilityState().then((initial) => {
      if (active) setState(initial);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}

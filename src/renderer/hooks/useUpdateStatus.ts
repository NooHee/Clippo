import { useCallback, useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/types';

interface UseUpdateStatus {
  /** Null until the first answer from the main process. */
  status: UpdateStatus | null;
  checkNow: () => Promise<void>;
}

/**
 * Mirrors the update checker that lives in the main process: reads the current status once and
 * then follows the changes main pushes (scheduled checks, tray checks, skips).
 */
export function useUpdateStatus(): UseUpdateStatus {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.clipstack.onUpdateStatusChanged((next) => setStatus(next));
    void window.clipstack.getUpdateStatus().then((current) => {
      if (active) setStatus(current);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const checkNow = useCallback(async () => {
    setStatus(await window.clipstack.checkForUpdates());
  }, []);

  return { status, checkNow };
}

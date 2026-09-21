'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  disablePush,
  enablePush,
  identifyPush,
  isPushConfigured,
  onPushChange,
  readPushState,
} from './onesignal';
import type { PushState } from './push-state';

/** Khởi tạo SDK + gắn staff.id sau khi đã vào dashboard (đã qua consent). */
export function usePushIdentity(staffId: string | undefined): void {
  useEffect(() => {
    if (staffId && isPushConfigured()) {
      void identifyPush(staffId);
    }
  }, [staffId]);
}

export function usePushSubscription(): {
  state: PushState;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void readPushState().then(setState, () => setState('unsupported'));
  }, []);

  useEffect(() => {
    if (!isPushConfigured()) return;
    refresh();
    return onPushChange(refresh);
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
      } catch {
        // Người dùng bấm "Chặn" hoặc SDK lỗi — trạng thái mới đọc lại bên dưới.
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  return {
    state,
    busy,
    enable: () => run(enablePush),
    disable: () => run(disablePush),
  };
}

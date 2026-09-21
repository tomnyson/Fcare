'use client';

import { useEffect } from 'react';
import { setMonitoringUser } from './bugsnag';

/** Gắn staff.id vào báo lỗi khi vào dashboard, gỡ khi rời/đăng xuất. */
export function useMonitoringUser(staffId: string | undefined): void {
  useEffect(() => {
    setMonitoringUser(staffId);
    return () => setMonitoringUser(undefined);
  }, [staffId]);
}

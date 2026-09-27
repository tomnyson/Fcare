'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ImportKindSlug } from './import-kinds';
import {
  IDLE_PROGRESS,
  clearIfDone,
  failProgress,
  finishProgress,
  progressView,
  startProgress,
  tickProgress,
  withUploadRatio,
  type ImportOperation,
  type ImportProgressView,
} from './import-progress';

/** Nhịp tính lại % ước lượng — đủ mượt, không đè render. */
const TICK_MS = 200;
/** Giữ 100% một nhịp cho người dùng thấy "xong" rồi ẩn (bản xem trước / kết quả thay chỗ). */
const DONE_HOLD_MS = 800;

export interface ImportProgressControls {
  view: ImportProgressView;
  start: (operation: ImportOperation, kind: ImportKindSlug) => void;
  setUploadRatio: (ratio: number | null) => void;
  finish: () => void;
  fail: () => void;
  reset: () => void;
}

/** Nối mô hình tiến độ thuần với đồng hồ; chỉ chạy interval khi đang xử lý. */
export function useImportProgress(): ImportProgressControls {
  const [state, setState] = useState(IDLE_PROGRESS);
  const running =
    state.phase === 'uploading' || state.phase === 'parsing' || state.phase === 'committing';

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setState((current) => tickProgress(current, Date.now()));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  const isDone = state.phase === 'done';
  useEffect(() => {
    if (!isDone) return;
    const id = window.setTimeout(() => setState(clearIfDone), DONE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [isDone]);

  const start = useCallback((operation: ImportOperation, kind: ImportKindSlug) => {
    setState(startProgress(operation, kind, Date.now()));
  }, []);
  const setUploadRatio = useCallback((ratio: number | null) => {
    setState((current) => withUploadRatio(current, ratio, Date.now()));
  }, []);
  const finish = useCallback(() => setState(finishProgress), []);
  const fail = useCallback(() => setState(failProgress), []);
  const reset = useCallback(() => setState(IDLE_PROGRESS), []);

  const view = useMemo(() => progressView(state), [state]);
  return { view, start, setUploadRatio, finish, fail, reset };
}

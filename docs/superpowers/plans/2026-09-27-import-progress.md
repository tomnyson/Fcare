# Import Progress Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện thanh tiến trình 0–100% kèm danh sách bước khi upload và khi commit một lượt import Excel.

**Architecture:** Chỉ phía web. Mô hình tiến độ là các hàm thuần bất biến (`lib/import-progress.ts`) — đoạn gửi file dùng % thật từ `XMLHttpRequest.upload.onprogress` (hàm mới `apiUploadWithProgress` trong `lib/api.ts`), đoạn máy chủ xử lý dùng ước lượng tiệm cận theo thời gian. Hook mỏng `useImportProgress` nối các hàm thuần với `setInterval`; component trình bày `ImportProgress` render thanh `role="progressbar"`. `import-wizard.tsx` gắn hook vào mutation upload/commit.

**Tech Stack:** Next.js 15 (App Router, client component), React 19, TanStack Query, Tailwind 4, Vitest (environment `node`, chỉ `src/**/*.test.ts`, render bằng `react-dom/server` `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-09-27-import-progress-design.md`

## Global Constraints

- Chỉ sửa `apps/web`; API giữ nguyên (không đổi endpoint, không thêm kênh tiến độ).
- Gửi file: 0 → 30% (thật). Máy chủ đọc file (`parsing`): 30 → < 90%, tau 8 000 ms. Commit: 5 → < 90%, tau 20 000 ms; `grade-attendance` tau 40 000 ms. `lengthComputable = false` → gửi file ước lượng 0 → 30, tau 3 000 ms.
- Chỉ lên 100% khi request thành công. % không bao giờ giảm. Làm tròn số nguyên.
- Công thức ước lượng: `p = start + (cap - start) * (1 - exp(-elapsedMs / tauMs))`.
- Bước upload: `Gửi file · Đọc file · Lọc dữ liệu cá nhân · Kiểm tra dữ liệu & ánh xạ · Lưu bản xem trước`. Bước commit: `Ghi dữ liệu vào hệ thống` (+ `Rà soát cảnh báo vắng` khi `grade-attendance`). Chỉ "Gửi file" được đánh dấu xong giữa chừng; mọi bước xong khi `done`.
- `apiUploadWithProgress` giữ hợp đồng `apiFetch`: `withCredentials = true`, header `X-Requested-With: XMLHttpRequest`, envelope `{ success, data, error, code }`, lỗi mạng → `ApiError(NETWORK_ERROR_MESSAGE, 0)`, 401 → `refreshSession()` rồi gửi lại MỘT lần, `CONSENT_REQUIRED`/`PASSWORD_CHANGE_REQUIRED` → chuyển trang. `apiUpload` cũ giữ nguyên.
- UI: `role="progressbar"` + `aria-valuemin/max/now/valuetext`; lấp bằng `transform: scaleX()` (không animate `width`); `motion-reduce:transition-none`; màu chỉ từ token (`fpt-blue`, `success`, `danger`) — không hardcode hex.
- Code, comment, chuỗi UI bằng tiếng Việt như code xung quanh; bất biến (trả object mới, không mutate).
- CLAUDE.md dự án: chạy GitNexus `impact` (repo `Fcare`) trước khi sửa symbol có sẵn; KHÔNG commit (user chỉ commit khi yêu cầu) — thay bước commit bằng checkpoint chạy test; KHÔNG `pnpm build` web khi `next dev` :3000 đang chạy (`lsof -i :3000` trước).
- Cổng hoàn thành: `pnpm typecheck && pnpm lint && pnpm test` xanh + build API.

## Review Focus

1. File nhỏ: `upload.onprogress` không bắn lần nào nhưng `upload.onload` bắn → phải sang `parsing` (30%), không kẹt ở 0. → test ở Task 1 (`withUploadRatio(…, 1)`) và Task 2 (`upload.onload` gọi `onUploadProgress(1)`).
2. Commit rất lâu (> 2 phút, `exp` tiến về 0) → % vẫn ≤ 89, không bao giờ 100 trước phản hồi. → test ở Task 1.
3. 401 giữa chừng: request gửi lại, progress gửi lại chạy từ 0 → % hiển thị không được tụt. → test ở Task 1 (ratio nhỏ khi đang `parsing` bị bỏ qua) và Task 2 (gọi lại đúng 1 lần).
4. Chuỗi nhiều loại: commit loại 1 xong (100%) rồi tự upload loại 2 → thanh phải bắt đầu lại từ 0 cho loại 2, không kẹt 100, và bộ hẹn giờ ẩn 800 ms của loại 1 không được ẩn nhầm thanh loại 2. → test ở Task 1 (`startProgress` luôn trả percent 0; `clearIfDone` chỉ ẩn khi còn `done`) + kiểm tra tay ở Task 4.
5. Lỗi request: thanh giữ % cuối, đổi tông lỗi; bấm chạy lại → reset. → test ở Task 1 (`failProgress`) và Task 3 (render tông `danger`).

---

## File Structure

| Tệp | Trách nhiệm |
|---|---|
| `apps/web/src/lib/import-progress.ts` (mới) | Kiểu + hàm thuần: chuyển trạng thái, tính %, dựng view (bước, nhãn, tông) |
| `apps/web/src/lib/import-progress.test.ts` (mới) | Test mô hình tiến độ |
| `apps/web/src/lib/api.ts` (sửa) | Tách `unwrapEnvelope`, thêm `apiUploadWithProgress` |
| `apps/web/src/lib/api.test.ts` (sửa) | Test `apiUploadWithProgress` với XHR giả |
| `apps/web/src/lib/use-import-progress.ts` (mới) | Hook nối hàm thuần + `setInterval` 200 ms |
| `apps/web/src/components/imports/import-progress.tsx` (mới) | Component trình bày thanh + danh sách bước |
| `apps/web/src/components/imports/import-progress.test.ts` (mới) | Test render tĩnh |
| `apps/web/src/components/imports/import-wizard.tsx` (sửa) | Gắn hook vào mutation upload/commit, render `ImportProgress` |
| `apps/web/src/components/imports/import-run-status.tsx` (sửa) | Bỏ đuôi "— đang đọc file…" và prop `isUploading` |

Ghi chú lệch spec (có chủ đích): spec §4.1 mô tả một hàm `progressFor(input)`; plan tách thành các hàm chuyển trạng thái thuần (`startProgress`, `withUploadRatio`, `tickProgress`, `finishProgress`, `failProgress`, `progressView`) để hook không phải gọi `Date.now()` trong render (luật `react-hooks/purity`). Spec §4.3 nói rAF throttle ~200 ms; plan dùng `setInterval(200)` — cùng tần suất, đơn giản hơn, dọn trong cleanup. Task 4 cập nhật spec cho khớp.

---

### Task 1: Mô hình tiến độ thuần

**Files:**
- Create: `apps/web/src/lib/import-progress.ts`
- Test: `apps/web/src/lib/import-progress.test.ts`

**Interfaces:**
- Consumes: `ImportKindSlug` từ `apps/web/src/lib/import-kinds.ts` (slug điểm danh là `'grade-attendance'`).
- Produces:
  ```ts
  export type ImportOperation = 'upload' | 'commit';
  export type ImportProgressPhase = 'idle' | 'uploading' | 'parsing' | 'committing' | 'done' | 'error';
  export type ImportProgressTone = 'idle' | 'running' | 'done' | 'error';
  export interface ImportProgressState {
    operation: ImportOperation;
    kind: ImportKindSlug | null;
    phase: ImportProgressPhase;
    uploadRatio: number | null;
    phaseStartedAt: number;
    percent: number;
  }
  export interface ImportProgressStep { label: string; done: boolean }
  export interface ImportProgressView {
    percent: number;
    tone: ImportProgressTone;
    label: string;
    valueText: string;
    steps: ReadonlyArray<ImportProgressStep>;
  }
  export const IDLE_PROGRESS: ImportProgressState;
  export function startProgress(operation: ImportOperation, kind: ImportKindSlug, now: number): ImportProgressState;
  export function withUploadRatio(state: ImportProgressState, ratio: number | null, now: number): ImportProgressState;
  export function tickProgress(state: ImportProgressState, now: number): ImportProgressState;
  export function finishProgress(state: ImportProgressState): ImportProgressState;
  export function failProgress(state: ImportProgressState): ImportProgressState;
  /** Ẩn thanh sau khi giữ 100%: chỉ về idle nếu vẫn đang `done` (loại kế tiếp đã start thì giữ nguyên). */
  export function clearIfDone(state: ImportProgressState): ImportProgressState;
  export function progressView(state: ImportProgressState): ImportProgressView;
  ```

- [ ] **Step 1: Write the failing test**

Tạo `apps/web/src/lib/import-progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  IDLE_PROGRESS,
  clearIfDone,
  failProgress,
  finishProgress,
  progressView,
  startProgress,
  tickProgress,
  withUploadRatio,
} from './import-progress';

const T0 = 1_000_000;

describe('startProgress', () => {
  it('upload bắt đầu ở pha gửi file, 0%', () => {
    const state = startProgress('upload', 'roster', T0);
    expect(state).toMatchObject({ operation: 'upload', phase: 'uploading', percent: 0, uploadRatio: null });
  });

  it('commit bắt đầu ở 5%', () => {
    expect(progressView(startProgress('commit', 'roster', T0)).percent).toBe(5);
  });

  it('loại kế tiếp trong chuỗi luôn bắt đầu lại từ 0 dù loại trước đã 100%', () => {
    const finished = finishProgress(startProgress('commit', 'roster', T0));
    expect(finished.percent).toBe(100);
    const next = startProgress('upload', 'grade-attendance', T0 + 10);
    expect(next.percent).toBe(0);
  });
});

describe('withUploadRatio — đoạn gửi file là % thật', () => {
  it('50% byte đã gửi → 15%', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 0.5, T0 + 100);
    expect(state.percent).toBe(15);
    expect(state.phase).toBe('uploading');
  });

  it('gửi xong (ratio 1) → sang pha máy chủ xử lý ở 30%, đánh dấu bước "Gửi file"', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0 + 100);
    expect(state).toMatchObject({ phase: 'parsing', percent: 30, phaseStartedAt: T0 + 100 });
    expect(progressView(state).steps[0]).toEqual({ label: 'Gửi file', done: true });
    expect(progressView(state).steps.slice(1).every((step) => !step.done)).toBe(true);
  });

  it('gửi lại sau 401 (ratio nhỏ khi đã ở pha máy chủ) → bỏ qua, % không tụt', () => {
    const parsing = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0);
    const again = withUploadRatio(parsing, 0.1, T0 + 50);
    expect(again).toBe(parsing);
  });

  it('ratio ngoài 0..1 được kẹp lại', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 1.7, T0);
    expect(state.percent).toBe(30);
  });

  it('không đo được byte (null) → ước lượng theo thời gian, luôn < 30', () => {
    const unknown = withUploadRatio(startProgress('upload', 'roster', T0), null, T0);
    const later = tickProgress(unknown, T0 + 3_000);
    expect(later.percent).toBeGreaterThan(0);
    expect(tickProgress(unknown, T0 + 10_000_000).percent).toBe(29);
  });
});

describe('tickProgress — đoạn máy chủ là ước lượng tiệm cận', () => {
  it('pha máy chủ đọc file: 30 → tiến dần, không bao giờ chạm 90', () => {
    const parsing = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0);
    const afterTau = tickProgress(parsing, T0 + 8_000);
    expect(afterTau.percent).toBe(67); // 30 + 60 * (1 - e^-1) = 67.9 → 67
    expect(tickProgress(parsing, T0 + 10_000_000).percent).toBe(89);
  });

  it('commit rất lâu (vượt 2 phút) vẫn ≤ 89, không bao giờ 100 trước phản hồi', () => {
    const committing = startProgress('commit', 'roster', T0);
    expect(tickProgress(committing, T0 + 180_000).percent).toBe(89);
    expect(tickProgress(committing, T0 + Number.MAX_SAFE_INTEGER / 2).percent).toBe(89);
  });

  it('file điểm danh commit chậm hơn loại khác (tau 40s vs 20s)', () => {
    const roster = tickProgress(startProgress('commit', 'roster', T0), T0 + 20_000);
    const attendance = tickProgress(startProgress('commit', 'grade-attendance', T0), T0 + 20_000);
    expect(roster.percent).toBe(58); // 5 + 85 * (1 - e^-1) = 58.7 → 58
    expect(attendance.percent).toBeLessThan(roster.percent);
  });

  it('không bao giờ lùi', () => {
    const committing = { ...startProgress('commit', 'roster', T0), percent: 70 };
    expect(tickProgress(committing, T0 + 1).percent).toBe(70);
  });

  it('pha đã xong / lỗi / idle không đổi khi tick', () => {
    const done = finishProgress(startProgress('commit', 'roster', T0));
    expect(tickProgress(done, T0 + 99_999)).toBe(done);
    expect(tickProgress(IDLE_PROGRESS, T0)).toBe(IDLE_PROGRESS);
  });
});

describe('finishProgress / failProgress', () => {
  it('xong → 100%, mọi bước đã xong, tông done', () => {
    const view = progressView(finishProgress(startProgress('upload', 'roster', T0)));
    expect(view.percent).toBe(100);
    expect(view.tone).toBe('done');
    expect(view.steps.every((step) => step.done)).toBe(true);
  });

  it('lỗi → giữ % cuối, tông error', () => {
    const running = tickProgress(startProgress('commit', 'roster', T0), T0 + 20_000);
    const failed = failProgress(running);
    expect(failed.percent).toBe(running.percent);
    expect(progressView(failed)).toMatchObject({ tone: 'error', label: 'Xử lý thất bại' });
  });

  it('clearIfDone: done → idle; loại kế tiếp đã bắt đầu thì không bị ẩn nhầm', () => {
    const done = finishProgress(startProgress('commit', 'roster', T0));
    expect(clearIfDone(done)).toBe(IDLE_PROGRESS);
    const next = startProgress('upload', 'grade-attendance', T0 + 10);
    expect(clearIfDone(next)).toBe(next);
    const failed = failProgress(next);
    expect(clearIfDone(failed)).toBe(failed);
  });

  it('không mutate state đầu vào', () => {
    const state = Object.freeze(startProgress('upload', 'roster', T0));
    expect(() => failProgress(finishProgress(withUploadRatio(state, 1, T0)))).not.toThrow();
  });
});

describe('progressView — danh sách bước & nhãn', () => {
  it('upload có 5 bước theo thứ tự', () => {
    const labels = progressView(startProgress('upload', 'roster', T0)).steps.map((s) => s.label);
    expect(labels).toEqual([
      'Gửi file',
      'Đọc file',
      'Lọc dữ liệu cá nhân',
      'Kiểm tra dữ liệu & ánh xạ',
      'Lưu bản xem trước',
    ]);
  });

  it('commit file điểm danh có thêm bước rà soát cảnh báo vắng', () => {
    const labels = progressView(startProgress('commit', 'grade-attendance', T0)).steps.map((s) => s.label);
    expect(labels).toEqual(['Ghi dữ liệu vào hệ thống', 'Rà soát cảnh báo vắng']);
  });

  it('commit loại khác chỉ có bước ghi dữ liệu', () => {
    const labels = progressView(startProgress('commit', 'roster', T0)).steps.map((s) => s.label);
    expect(labels).toEqual(['Ghi dữ liệu vào hệ thống']);
  });

  it('valueText cho trình đọc màn hình ghép nhãn + %', () => {
    const view = progressView(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(view.valueText).toBe('Máy chủ đang đọc và kiểm tra file — 30%');
  });

  it('idle không có bước, tông idle', () => {
    expect(progressView(IDLE_PROGRESS)).toMatchObject({ tone: 'idle', percent: 0, steps: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/import-progress.test.ts`
Expected: FAIL — `Failed to resolve import "./import-progress"`.

- [ ] **Step 3: Write minimal implementation**

Tạo `apps/web/src/lib/import-progress.ts`:

```ts
import type { ImportKindSlug } from './import-kinds';

/**
 * Tiến độ một lượt upload/commit import. API không báo tiến độ nội bộ nên chỉ
 * đoạn GỬI FILE là % thật (byte đã gửi); đoạn máy chủ xử lý là ước lượng tiệm
 * cận theo thời gian — không bao giờ tự chạm trần, chỉ lên 100% khi có phản hồi.
 * Mọi hàm thuần và bất biến để test được mà không cần DOM.
 */
export type ImportOperation = 'upload' | 'commit';
export type ImportProgressPhase = 'idle' | 'uploading' | 'parsing' | 'committing' | 'done' | 'error';
export type ImportProgressTone = 'idle' | 'running' | 'done' | 'error';

export interface ImportProgressState {
  operation: ImportOperation;
  kind: ImportKindSlug | null;
  phase: ImportProgressPhase;
  /** 0..1 byte đã gửi; null = trình duyệt không đo được. */
  uploadRatio: number | null;
  phaseStartedAt: number;
  percent: number;
}

export interface ImportProgressStep {
  label: string;
  done: boolean;
}

export interface ImportProgressView {
  percent: number;
  tone: ImportProgressTone;
  label: string;
  valueText: string;
  steps: ReadonlyArray<ImportProgressStep>;
}

const SEND_CAP = 30;
const ESTIMATE_CAP = 90;
const COMMIT_START = 5;
const SEND_TAU_MS = 3_000;
const PARSE_TAU_MS = 8_000;
const COMMIT_TAU_MS = 20_000;
const ATTENDANCE_COMMIT_TAU_MS = 40_000;

const UPLOAD_STEPS = [
  'Gửi file',
  'Đọc file',
  'Lọc dữ liệu cá nhân',
  'Kiểm tra dữ liệu & ánh xạ',
  'Lưu bản xem trước',
] as const;
const COMMIT_STEP = 'Ghi dữ liệu vào hệ thống';
const ATTENDANCE_REVIEW_STEP = 'Rà soát cảnh báo vắng';

const PHASE_LABELS: Record<ImportProgressPhase, string> = {
  idle: '',
  uploading: 'Đang gửi file',
  parsing: 'Máy chủ đang đọc và kiểm tra file',
  committing: 'Đang ghi dữ liệu',
  done: 'Hoàn tất',
  error: 'Xử lý thất bại',
};

export const IDLE_PROGRESS: ImportProgressState = {
  operation: 'upload',
  kind: null,
  phase: 'idle',
  uploadRatio: null,
  phaseStartedAt: 0,
  percent: 0,
};

/** Tiệm cận `cap` nhưng không bao giờ chạm: kẹp ở `cap - 1` (exp có thể về 0 khi rất lâu). */
function estimate(start: number, cap: number, elapsedMs: number, tauMs: number): number {
  const value = start + (cap - start) * (1 - Math.exp(-Math.max(0, elapsedMs) / tauMs));
  return Math.min(cap - 1, Math.floor(value));
}

function clampRatio(ratio: number): number {
  return Math.min(1, Math.max(0, ratio));
}

function rawPercent(state: ImportProgressState, now: number): number {
  const elapsed = now - state.phaseStartedAt;
  switch (state.phase) {
    case 'uploading':
      return state.uploadRatio === null
        ? estimate(0, SEND_CAP, elapsed, SEND_TAU_MS)
        : Math.floor(state.uploadRatio * SEND_CAP);
    case 'parsing':
      return estimate(SEND_CAP, ESTIMATE_CAP, elapsed, PARSE_TAU_MS);
    case 'committing':
      return estimate(
        COMMIT_START,
        ESTIMATE_CAP,
        elapsed,
        state.kind === 'grade-attendance' ? ATTENDANCE_COMMIT_TAU_MS : COMMIT_TAU_MS,
      );
    default:
      return state.percent;
  }
}

function isRunning(phase: ImportProgressPhase): boolean {
  return phase === 'uploading' || phase === 'parsing' || phase === 'committing';
}

/** Loại mới trong chuỗi luôn bắt đầu lại — không kế thừa % của loại trước. */
export function startProgress(
  operation: ImportOperation,
  kind: ImportKindSlug,
  now: number,
): ImportProgressState {
  return {
    operation,
    kind,
    phase: operation === 'upload' ? 'uploading' : 'committing',
    uploadRatio: null,
    phaseStartedAt: now,
    percent: operation === 'upload' ? 0 : COMMIT_START,
  };
}

/**
 * Byte đã gửi. Gửi xong → sang pha máy chủ xử lý. Ngoài pha gửi file (vd.
 * request gửi lại sau 401 khi đã ở pha máy chủ) thì bỏ qua để % không tụt.
 */
export function withUploadRatio(
  state: ImportProgressState,
  ratio: number | null,
  now: number,
): ImportProgressState {
  if (state.phase !== 'uploading') return state;
  if (ratio === null) return { ...state, uploadRatio: null };
  const clamped = clampRatio(ratio);
  if (clamped >= 1) {
    return {
      ...state,
      uploadRatio: 1,
      phase: 'parsing',
      phaseStartedAt: now,
      percent: Math.max(state.percent, SEND_CAP),
    };
  }
  return {
    ...state,
    uploadRatio: clamped,
    percent: Math.max(state.percent, Math.floor(clamped * SEND_CAP)),
  };
}

/** Tính lại % theo thời gian; không bao giờ lùi. Pha không chạy thì trả nguyên state. */
export function tickProgress(state: ImportProgressState, now: number): ImportProgressState {
  if (!isRunning(state.phase)) return state;
  const percent = Math.max(state.percent, rawPercent(state, now));
  return percent === state.percent ? state : { ...state, percent };
}

export function finishProgress(state: ImportProgressState): ImportProgressState {
  return { ...state, phase: 'done', percent: 100 };
}

/** Lỗi: giữ % cuối để người dùng thấy dừng ở đâu. */
export function failProgress(state: ImportProgressState): ImportProgressState {
  return { ...state, phase: 'error' };
}

/** Hết thời gian giữ 100% → ẩn; nếu loại kế tiếp trong chuỗi đã start thì không đụng tới. */
export function clearIfDone(state: ImportProgressState): ImportProgressState {
  return state.phase === 'done' ? IDLE_PROGRESS : state;
}

function stepLabels(state: ImportProgressState): ReadonlyArray<string> {
  if (state.phase === 'idle') return [];
  if (state.operation === 'upload') return UPLOAD_STEPS;
  return state.kind === 'grade-attendance' ? [COMMIT_STEP, ATTENDANCE_REVIEW_STEP] : [COMMIT_STEP];
}

/** Web không biết máy chủ đang ở bước nào — chỉ "Gửi file" được đánh dấu xong giữa chừng. */
function isStepDone(state: ImportProgressState, index: number): boolean {
  if (state.phase === 'done') return true;
  const sendFinished = state.phase === 'parsing' || state.uploadRatio === 1;
  return state.operation === 'upload' && index === 0 && sendFinished;
}

function toneOf(phase: ImportProgressPhase): ImportProgressTone {
  if (phase === 'idle') return 'idle';
  if (phase === 'done') return 'done';
  if (phase === 'error') return 'error';
  return 'running';
}

export function progressView(state: ImportProgressState): ImportProgressView {
  const label = PHASE_LABELS[state.phase];
  return {
    percent: state.percent,
    tone: toneOf(state.phase),
    label,
    valueText: label ? `${label} — ${state.percent}%` : '',
    steps: stepLabels(state).map((stepLabel, index) => ({
      label: stepLabel,
      done: isStepDone(state, index),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/import-progress.test.ts`
Expected: PASS (tất cả test). Nếu hai giá trị số cụ thể (67, 58) lệch 1 do làm tròn, tính lại bằng công thức và sửa **test** chỉ khi công thức đúng như Global Constraints.

- [ ] **Step 5: Checkpoint (không commit)**

Run: `cd apps/web && npx eslint src/lib/import-progress.ts src/lib/import-progress.test.ts`
Expected: không lỗi.

---

### Task 2: `apiUploadWithProgress` (XHR giữ hợp đồng `apiFetch`)

**Files:**
- Modify: `apps/web/src/lib/api.ts` (tách phần cuối `apiFetch` thành `unwrapEnvelope`; thêm hàm mới ngay sau `apiUpload`)
- Test: `apps/web/src/lib/api.test.ts` (thêm `describe` mới ở cuối file)

**Interfaces:**
- Consumes (có sẵn trong `api.ts`): `API_URL`, `ApiError`, `NETWORK_ERROR_MESSAGE`, `readEnvelope<T>(response: Response)`, `refreshSession(): Promise<'ok' | 'unauthorized' | 'error'>`, `redirectToLogin()`, `redirectForCode(code)`.
- Produces:
  ```ts
  export function apiUploadWithProgress<T>(
    path: string,
    file: File,
    fields: Record<string, string> | undefined,
    onUploadProgress: (ratio: number | null) => void,
  ): Promise<T>;
  ```
  `ratio` là 0..1, `null` khi `lengthComputable = false`; luôn gọi `onUploadProgress(1)` khi `xhr.upload.onload` bắn.

- [ ] **Step 1: Impact check trước khi sửa `apiFetch`**

Chạy GitNexus: `impact({ target: "apiFetch", direction: "upstream", repo: "Fcare" })`.
Ghi lại mức rủi ro trong báo cáo task. `apiFetch` có rất nhiều caller → nếu HIGH/CRITICAL: báo user; thay đổi ở đây chỉ là tách hàm giữ nguyên hành vi, được bảo vệ bởi các test `apiFetch` hiện có trong `api.test.ts`.

- [ ] **Step 2: Write the failing test**

Thêm vào cuối `apps/web/src/lib/api.test.ts` (sửa dòng import đầu file thành `import { ApiError, apiDownload, apiFetch, apiUploadWithProgress } from './api';`):

```ts
type FakeReply = { status: number; body: unknown; progress?: 'computable' | 'unknown' | 'none' } | 'network-error';

/** XHR giả tối thiểu: mỗi `send` lấy một phản hồi dựng sẵn theo thứ tự. */
class FakeXhr {
  static replies: FakeReply[] = [];
  static sent: FakeXhr[] = [];
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  status = 0;
  responseText = '';
  withCredentials = false;
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers = { ...this.headers, [name]: value };
  }

  send(body: unknown) {
    this.body = body;
    FakeXhr.sent.push(this);
    const reply = FakeXhr.replies.shift() ?? 'network-error';
    queueMicrotask(() => {
      if (reply === 'network-error') {
        this.onerror?.();
        return;
      }
      if (reply.progress !== 'none') {
        const computable = reply.progress !== 'unknown';
        this.upload.onprogress?.({ lengthComputable: computable, loaded: 50, total: computable ? 100 : 0 });
      }
      this.upload.onload?.();
      this.status = reply.status;
      this.responseText = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
      this.onload?.();
    });
  }
}

function useFakeXhr(replies: FakeReply[]) {
  FakeXhr.replies = [...replies];
  FakeXhr.sent = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

const file = new File(['x'], 'diem-danh.xlsx');

describe('apiUploadWithProgress — upload có % mà vẫn giữ hợp đồng apiFetch', () => {
  it('báo % byte đã gửi, luôn báo 1 khi gửi xong, trả data', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: { id: 'b1' }, error: null } }]);
    const ratios: Array<number | null> = [];
    const result = await apiUploadWithProgress<{ id: string }>(
      '/imports/roster/upload',
      file,
      { term: 'FA26' },
      (ratio) => ratios.push(ratio),
    );
    expect(result).toEqual({ id: 'b1' });
    expect(ratios).toEqual([0.5, 1]);
    const [xhr] = FakeXhr.sent;
    expect(xhr.method).toBe('POST');
    expect(xhr.url.endsWith('/imports/roster/upload')).toBe(true);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers['X-Requested-With']).toBe('XMLHttpRequest');
    expect(xhr.body).toBeInstanceOf(FormData);
    expect((xhr.body as FormData).get('term')).toBe('FA26');
  });

  it('file nhỏ không bắn onprogress → vẫn báo 1 khi upload.onload', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: 1, error: null }, progress: 'none' }]);
    const ratios: Array<number | null> = [];
    await apiUploadWithProgress('/x', file, undefined, (ratio) => ratios.push(ratio));
    expect(ratios).toEqual([1]);
  });

  it('không đo được kích thước → báo null', async () => {
    useFakeXhr([{ status: 200, body: { success: true, data: 1, error: null }, progress: 'unknown' }]);
    const ratios: Array<number | null> = [];
    await apiUploadWithProgress('/x', file, undefined, (ratio) => ratios.push(ratio));
    expect(ratios).toEqual([null, 1]);
  });

  it('401 → làm mới phiên rồi gửi lại đúng MỘT lần', async () => {
    useFakeXhr([
      { status: 401, body: { success: false, data: null, error: 'Hết hạn' } },
      { status: 200, body: { success: true, data: 'ok', error: null } },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true, data: null, error: null }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiUploadWithProgress('/x', file, undefined, () => {})).resolves.toBe('ok');
    expect(FakeXhr.sent).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0][0]).endsWith('/auth/refresh')).toBe(true);
  });

  it('401 và làm mới bị từ chối → về /login, lỗi hết phiên', async () => {
    useFakeXhr([{ status: 401, body: { success: false, data: null, error: 'Hết hạn' } }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { success: false })));
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.status).toBe(401);
    expect(location.href).toBe('/login');
    expect(FakeXhr.sent).toHaveLength(1);
  });

  it('lỗi nghiệp vụ giữ câu tiếng Việt + code', async () => {
    useFakeXhr([
      { status: 400, body: { success: false, data: null, error: 'File sai mẫu.', code: 'BAD_TEMPLATE' } },
    ]);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error).toMatchObject({ message: 'File sai mẫu.', status: 400, code: 'BAD_TEMPLATE' });
  });

  it('cần ký cam kết → chuyển /consent', async () => {
    useFakeXhr([
      { status: 403, body: { success: false, data: null, error: 'Cần ký', code: 'CONSENT_REQUIRED' } },
    ]);
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(location.href).toBe('/consent');
  });

  it('máy chủ trả HTML (502) → câu "Máy chủ đang bận"', async () => {
    useFakeXhr([{ status: 502, body: '<html>Bad Gateway</html>' }]);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.message).toBe('Máy chủ đang bận hoặc gặp sự cố (mã 502). Vui lòng thử lại.');
  });

  it('mất mạng → lỗi mạng tiếng Việt, status 0', async () => {
    useFakeXhr(['network-error']);
    const error = await caught(apiUploadWithProgress('/x', file, undefined, () => {}));
    expect(error.status).toBe(0);
    expect(error.message).toBe('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/lib/api.test.ts`
Expected: FAIL — `apiUploadWithProgress is not a function` (hoặc lỗi import); các test `apiFetch` cũ vẫn PASS.

- [ ] **Step 4: Tách `unwrapEnvelope` khỏi `apiFetch` (giữ nguyên hành vi)**

Trong `apps/web/src/lib/api.ts`, thay đoạn cuối của `apiFetch`:

```ts
  const body = await readEnvelope<T>(response);
  if (!body.success || !response.ok) {
    if (redirectForCode(body.code)) {
      throw new ApiError(body.error ?? 'Cần hoàn tất bước xác nhận.', response.status, body.code);
    }
    throw new ApiError(body.error ?? 'Đã xảy ra lỗi.', response.status, body.code);
  }
  return body.data as T;
}
```

bằng:

```ts
  return unwrapEnvelope<T>(response);
}

/** Đọc envelope; lỗi → ApiError (kèm chuyển trang consent / mật khẩu tạm). */
async function unwrapEnvelope<T>(response: Response): Promise<T> {
  const body = await readEnvelope<T>(response);
  if (!body.success || !response.ok) {
    if (redirectForCode(body.code)) {
      throw new ApiError(body.error ?? 'Cần hoàn tất bước xác nhận.', response.status, body.code);
    }
    throw new ApiError(body.error ?? 'Đã xảy ra lỗi.', response.status, body.code);
  }
  return body.data as T;
}
```

Run: `cd apps/web && npx vitest run src/lib/api.test.ts -t apiFetch`
Expected: các test `apiFetch` vẫn PASS.

- [ ] **Step 5: Thêm `apiUploadWithProgress` ngay sau `apiUpload`**

```ts
interface XhrReply {
  status: number;
  text: string;
}

/** Một lượt gửi multipart qua XHR — fetch không báo được byte đã gửi. */
function sendWithProgress(
  path: string,
  formData: FormData,
  onUploadProgress: (ratio: number | null) => void,
): Promise<XhrReply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.upload.onprogress = (event) => {
      onUploadProgress(event.lengthComputable && event.total > 0 ? event.loaded / event.total : null);
    };
    // File nhỏ có thể không bắn onprogress lần nào — luôn chốt "đã gửi xong".
    xhr.upload.onload = () => onUploadProgress(1);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new ApiError(NETWORK_ERROR_MESSAGE, 0));
    xhr.send(formData);
  });
}

/**
 * Như `apiUpload` nhưng báo tiến độ gửi file (0..1, null = không đo được).
 * Giữ hợp đồng `apiFetch`: CSRF header, cookie, envelope, 401 → làm mới phiên
 * rồi gửi lại MỘT lần, chuyển trang theo mã consent / mật khẩu tạm.
 */
export async function apiUploadWithProgress<T>(
  path: string,
  file: File,
  fields: Record<string, string> | undefined,
  onUploadProgress: (ratio: number | null) => void,
): Promise<T> {
  const formData = new FormData();
  formData.append('file', file);
  for (const [key, value] of Object.entries(fields ?? {})) {
    formData.append(key, value);
  }

  let reply = await sendWithProgress(path, formData, onUploadProgress);
  if (reply.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed === 'unauthorized') {
      redirectToLogin();
      throw new ApiError('Phiên đăng nhập đã hết hạn.', 401);
    }
    if (refreshed === 'error') {
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
    reply = await sendWithProgress(path, formData, onUploadProgress);
  }
  if (reply.status === 0) {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  }
  return unwrapEnvelope<T>(new Response(reply.text, { status: reply.status }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/lib/api.test.ts`
Expected: PASS toàn bộ file (test cũ + 9 test mới).

- [ ] **Step 7: Checkpoint (không commit)**

Run: `cd apps/web && npx eslint src/lib/api.ts src/lib/api.test.ts && npx tsc --noEmit -p .`
Expected: không lỗi.

---

### Task 3: Hook `useImportProgress` + component `ImportProgress`

**Files:**
- Create: `apps/web/src/lib/use-import-progress.ts`
- Create: `apps/web/src/components/imports/import-progress.tsx`
- Test: `apps/web/src/components/imports/import-progress.test.ts`

**Interfaces:**
- Consumes (Task 1): `IDLE_PROGRESS`, `startProgress`, `withUploadRatio`, `tickProgress`, `finishProgress`, `failProgress`, `progressView`, types `ImportOperation`, `ImportProgressView`, `ImportProgressTone`. `ImportKindSlug` từ `import-kinds.ts`.
- Produces:
  ```ts
  // lib/use-import-progress.ts
  export interface ImportProgressControls {
    view: ImportProgressView;
    start: (operation: ImportOperation, kind: ImportKindSlug) => void;
    setUploadRatio: (ratio: number | null) => void;
    finish: () => void;
    fail: () => void;
    reset: () => void;
  }
  export function useImportProgress(): ImportProgressControls;

  // components/imports/import-progress.tsx
  export function ImportProgress(props: { view: ImportProgressView }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing test**

Tạo `apps/web/src/components/imports/import-progress.test.ts`:

```ts
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IDLE_PROGRESS,
  failProgress,
  finishProgress,
  progressView,
  startProgress,
  withUploadRatio,
} from '../../lib/import-progress';
import { ImportProgress } from './import-progress';

const T0 = 1_000;

function render(state: Parameters<typeof progressView>[0]): string {
  return renderToStaticMarkup(h(ImportProgress, { view: progressView(state) }));
}

describe('ImportProgress', () => {
  it('idle → không render gì', () => {
    expect(render(IDLE_PROGRESS)).toBe('');
  });

  it('thanh progressbar có aria đầy đủ và số %', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="30"');
    expect(html).toContain('aria-valuetext="Máy chủ đang đọc và kiểm tra file — 30%"');
    expect(html).toContain('30%');
  });

  it('lấp thanh bằng transform scaleX, không dùng width', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 0.5, T0));
    expect(html).toContain('transform:scaleX(0.15)');
    expect(html).not.toMatch(/style="[^"]*width/);
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('liệt kê bước, bước đã xong có dấu ✓', () => {
    const html = render(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(html).toContain('✓ Gửi file');
    expect(html).toContain('Lọc dữ liệu cá nhân');
  });

  it('tông theo trạng thái: chạy = fpt-blue, xong = success, lỗi = danger', () => {
    expect(render(startProgress('commit', 'roster', T0))).toContain('bg-fpt-blue');
    expect(render(finishProgress(startProgress('commit', 'roster', T0)))).toContain('bg-success');
    expect(render(failProgress(startProgress('commit', 'roster', T0)))).toContain('bg-danger');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx vitest run src/components/imports/import-progress.test.ts`
Expected: FAIL — không resolve được `./import-progress`.

- [ ] **Step 3: Implement component**

Tạo `apps/web/src/components/imports/import-progress.tsx`:

```tsx
import type { ImportProgressTone, ImportProgressView } from '../../lib/import-progress';

const BAR_TONE: Record<ImportProgressTone, string> = {
  idle: 'bg-fpt-blue',
  running: 'bg-fpt-blue',
  done: 'bg-success',
  error: 'bg-danger',
};

/**
 * Thanh tiến trình import. Chỉ đoạn gửi file là % thật — danh sách bước mô tả
 * việc hệ thống làm, không đánh dấu bước máy chủ đang chạy (web không biết).
 */
export function ImportProgress({ view }: { view: ImportProgressView }) {
  if (view.tone === 'idle') {
    return null;
  }
  return (
    <div className="space-y-2 rounded-md bg-fpt-blue/5 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{view.label}</span>
        <span className="font-semibold tabular-nums text-ink">{`${view.percent}%`}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Tiến trình import"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.percent}
        aria-valuetext={view.valueText}
        className="h-2 overflow-hidden rounded-full bg-fpt-blue/10"
      >
        <div
          className={`h-full origin-left rounded-full transition-transform duration-[var(--duration-normal)] ease-out motion-reduce:transition-none ${BAR_TONE[view.tone]}`}
          style={{ transform: `scaleX(${view.percent / 100})` }}
        />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {view.steps.map((step) => (
          <li key={step.label} className={step.done ? 'text-success' : 'text-muted'}>
            {`${step.done ? '✓' : '•'} ${step.label}`}
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx vitest run src/components/imports/import-progress.test.ts`
Expected: PASS. (`renderToStaticMarkup` in style dạng `transform:scaleX(0.15)` — nếu React chèn khoảng trắng khác, sửa chuỗi mong đợi trong test cho khớp output thật, giữ ý "dùng scaleX".)

- [ ] **Step 5: Implement hook**

Tạo `apps/web/src/lib/use-import-progress.ts`:

```ts
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
```

- [ ] **Step 6: Checkpoint (không commit)**

Run: `cd apps/web && npx eslint src/lib/use-import-progress.ts src/components/imports/import-progress.tsx src/components/imports/import-progress.test.ts && npx tsc --noEmit -p .`
Expected: không lỗi.

---

### Task 4: Gắn vào trình hướng dẫn import + kiểm chứng

**Files:**
- Modify: `apps/web/src/components/imports/import-wizard.tsx` (import, mutation `upload` ~dòng 141–157, `commit` ~159–191, `clearRunState` ~112–118, `stopRun` ~131–139, JSX ~276–280)
- Modify: `apps/web/src/components/imports/import-run-status.tsx` (prop `isUploading`, dòng "— đang đọc file…")
- Modify: `docs/superpowers/specs/2026-09-27-import-progress-design.md` (§4.1, §4.3 cho khớp plan)

**Interfaces:**
- Consumes: `useImportProgress()` (Task 3), `ImportProgress` (Task 3), `apiUploadWithProgress` (Task 2).
- Produces: không có API mới; `ImportRunStatus` bỏ prop `isUploading` (`ImportRunStatusProps` còn `{ run: ImportRun }`).

- [ ] **Step 1: Impact check**

Chạy GitNexus `impact` (repo `Fcare`, direction `upstream`) cho `ImportWizard` và `ImportRunStatus`. Kỳ vọng: LOW (chỉ trang import dùng). Nếu HIGH/CRITICAL → dừng, báo user.

- [ ] **Step 2: Bỏ `isUploading` khỏi `ImportRunStatus`**

Trong `import-run-status.tsx`:

```tsx
interface ImportRunStatusProps {
  run: ImportRun;
}

/** Dòng tiến độ (chỉ khi chạy nhiều loại) + danh sách kết quả từng loại đã ghi. */
export function ImportRunStatus({ run }: ImportRunStatusProps) {
```

và xoá dòng `{isUploading ? ' — đang đọc file…' : ''}` (thanh tiến trình thay thế).

Run: `cd apps/web && grep -rn "isUploading" src/`
Expected: chỉ còn chỗ truyền prop trong `import-wizard.tsx` (sẽ xoá ở Step 4).

- [ ] **Step 3: Nối hook vào mutation**

Trong `import-wizard.tsx`:

Import — đổi `import { ApiError, apiFetch, apiUpload } from '../../lib/api';` thành
`import { ApiError, apiFetch, apiUploadWithProgress } from '../../lib/api';` và thêm:

```tsx
import { ImportProgress } from './import-progress';
import { useImportProgress } from '../../lib/use-import-progress';
```

Ngay sau `const queryClient = useQueryClient();` thêm `const progress = useImportProgress();`.

Trong `clearRunState()` thêm dòng cuối `progress.reset();`.

Mutation `upload`:

```tsx
  const upload = useMutation({
    mutationFn: ({ slug, source }: { slug: ImportKindSlug; source: File }) =>
      apiUploadWithProgress<ImportBatchDetail>(
        `/imports/${slug}/upload`,
        source,
        { term },
        progress.setUploadRatio,
      ),
    onMutate: ({ slug }) => progress.start('upload', slug),
    onSuccess: (result) => {
      progress.finish();
      setBatch(result);
      setError('');
    },
    onError: (err, variables) => {
      progress.fail();
      const detail = err instanceof ApiError ? err.message : 'Không đọc được file.';
      // ... giữ nguyên phần còn lại
    },
  });
```

Mutation `commit`: thêm `onMutate: ({ slug }) => progress.start('commit', slug),`; dòng đầu `onSuccess` thêm `progress.finish();` (upload loại kế tiếp gọi `upload.mutate` → `onMutate` tự `start` lại từ 0); dòng đầu `onError` thêm `progress.fail();`.

Mutation `discard` và `resume` KHÔNG gọi progress (không phải upload/commit); `clearRunState()` đã `reset()`.

- [ ] **Step 4: Render thanh**

Thay khối:

```tsx
      <div className="mb-4 space-y-2">
        <FormError>{error}</FormError>
        <ImportRunStatus run={run} isUploading={upload.isPending} />
        <FormSuccess>{done}</FormSuccess>
      </div>
```

bằng:

```tsx
      <div className="mb-4 space-y-2">
        <FormError>{error}</FormError>
        <ImportRunStatus run={run} />
        <ImportProgress view={progress.view} />
        <FormSuccess>{done}</FormSuccess>
      </div>
```

Nhãn nút "Đang đọc file…" ở cuối file giữ nguyên.

- [ ] **Step 5: Cập nhật spec cho khớp plan**

Trong `docs/superpowers/specs/2026-09-27-import-progress-design.md`:
- §4.1: thay khối `progressFor(input)` bằng danh sách hàm thuần của Task 1 (`IDLE_PROGRESS`, `startProgress`, `withUploadRatio`, `tickProgress`, `finishProgress`, `failProgress`, `progressView`) kèm lý do "hook không gọi `Date.now()` trong render".
- §4.3: "tick bằng `requestAnimationFrame` (throttle ~200 ms)" → "tick bằng `setInterval` 200 ms".

- [ ] **Step 6: Chạy toàn bộ cổng**

Run (từ gốc repo):
```bash
pnpm typecheck && pnpm lint && pnpm test
lsof -i :3000 -sTCP:LISTEN || echo "next dev không chạy"
pnpm --filter @fcare/api build
```
Expected: typecheck/lint/test xanh; build API OK. Chỉ chạy `pnpm --filter @fcare/web build` nếu `lsof` báo :3000 KHÔNG có tiến trình.

- [ ] **Step 7: Kiểm tra tay trên trình duyệt (dev server :3000)**

1. Đăng nhập tài khoản Đào tạo (xem `README.md`), vào trang Import.
2. DevTools → Network → "Fast 3G". Chọn "Điểm danh", học kỳ hiện tại, file điểm danh thật (~3000 dòng) → "Đọc file và xem trước".
   Kỳ vọng: thanh chạy 0 → 30% theo byte, "✓ Gửi file", rồi tiến chậm dưới 90%, lên 100% khi hiện bản xem trước.
3. Bấm xác nhận commit. Kỳ vọng: bắt đầu 5%, danh sách bước có "Rà soát cảnh báo vắng", lên 100% khi có kết quả.
4. Tick 2 loại dùng chung file phân công → chạy chuỗi. Kỳ vọng: sau commit loại 1 (100%), loại 2 bắt đầu lại từ 0; dòng "Đang xử lý 2/2" vẫn hiện.
5. Tắt API giữa lúc upload → thanh dừng, tông đỏ, thông báo lỗi mạng; bấm chạy lại → reset.
6. Bật "Emulate prefers-reduced-motion: reduce" → thanh nhảy không animation.
7. Xem ở 320 / 768 / 1440 px: không tràn ngang, danh sách bước xuống dòng gọn.

- [ ] **Step 8: Checkpoint (không commit)**

Báo user kết quả Step 6–7 (kèm lỗi nếu có). Chạy `detect_changes({ scope: "compare", base_ref: "main", repo: "Fcare" })` và chỉ commit khi user yêu cầu.

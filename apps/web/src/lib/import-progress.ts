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

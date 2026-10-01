/**
 * Khoá ứng dụng bằng PIN cá nhân — quy tắc dùng chung cho API (kiểm thật)
 * và web (báo lỗi sớm khi người dùng gõ). PIN chỉ lưu dạng băm ở server.
 */
export const PIN_LENGTH = 6;

/** Sai quá số lần này thì thu hồi mọi phiên — phải đăng nhập lại bằng mật khẩu. */
export const MAX_PIN_ATTEMPTS = 5;

/** Các mốc ADMIN được chọn cho "không thao tác bao lâu thì khoá". */
export const IDLE_LOCK_MINUTES_OPTIONS = [3, 5, 10, 15, 30, 60] as const;
export type IdleLockMinutes = (typeof IDLE_LOCK_MINUTES_OPTIONS)[number];
export const DEFAULT_IDLE_LOCK_MINUTES: IdleLockMinutes = 15;

export function isIdleLockMinutes(value: unknown): value is IdleLockMinutes {
  return (
    typeof value === 'number' &&
    (IDLE_LOCK_MINUTES_OPTIONS as ReadonlyArray<number>).includes(value)
  );
}

/** Thao tác phá huỷ cần "vừa nhập lại PIN" — server cấp bằng chứng ngắn hạn theo mục đích. */
export const PIN_PROOF_PURPOSES = ['BACKUP_RESTORE', 'ALERT_DELETE'] as const;
export type PinProofPurpose = (typeof PIN_PROOF_PURPOSES)[number];
export const PIN_PROOF_HEADER = 'x-pin-proof';

function isSequential(pin: string, step: 1 | -1): boolean {
  for (let i = 1; i < pin.length; i += 1) {
    if (pin.charCodeAt(i) - pin.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/** null = hợp lệ; ngược lại là câu báo lỗi tiếng Việt. */
export function validatePinFormat(pin: string): string | null {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) {
    return `Mã PIN phải gồm đúng ${PIN_LENGTH} chữ số.`;
  }
  if (/^(\d)\1+$/.test(pin) || isSequential(pin, 1) || isSequential(pin, -1)) {
    return 'Mã PIN quá dễ đoán (lặp một số hoặc dãy liên tiếp). Vui lòng chọn mã khác.';
  }
  return null;
}

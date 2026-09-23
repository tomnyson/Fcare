import { isSystemPinEnabled, verifySystemPin } from './system-pin';

/**
 * Từ khóa API vẫn yêu cầu trong body `POST /backups/:id/restore`. Người dùng
 * không còn gõ từ khóa này nữa (đã thay bằng PIN hệ thống) nhưng hợp đồng với
 * API giữ nguyên nên web tự gửi kèm sau khi PIN đã được xác thực.
 */
export const RESTORE_CONFIRMATION_KEYWORD = 'XAC NHAN';

export const SYSTEM_PIN_LENGTH = 6;

/** Số lần nhập sai tối đa trước khi khoá nút phục hồi (đóng modal để thử lại). */
export const MAX_RESTORE_ATTEMPTS = 5;

export type RestoreGate = { kind: 'pin'; length: number } | { kind: 'keyword'; keyword: string };

export type RestoreGateResult =
  { ok: true } | { ok: false; reason: 'incomplete' | 'wrong'; message: string };

/**
 * PIN hệ thống là chốt chặn mặc định. Khi môi trường chưa cấu hình
 * `NEXT_PUBLIC_SYSTEM_PIN` (dev/CI) thì rơi về từ khóa để ADMIN không bị
 * khoá cứng khỏi tính năng phục hồi.
 */
export function resolveRestoreGate(): RestoreGate {
  return isSystemPinEnabled()
    ? { kind: 'pin', length: SYSTEM_PIN_LENGTH }
    : { kind: 'keyword', keyword: RESTORE_CONFIRMATION_KEYWORD };
}

export function checkRestoreGate(gate: RestoreGate, input: string): RestoreGateResult {
  if (gate.kind === 'pin') {
    if (input.length < gate.length) {
      return {
        ok: false,
        reason: 'incomplete',
        message: `Vui lòng nhập đủ ${gate.length} chữ số mã PIN hệ thống.`,
      };
    }
    return verifySystemPin(input)
      ? { ok: true }
      : { ok: false, reason: 'wrong', message: 'Mã PIN không đúng.' };
  }

  return input.trim().toUpperCase() === gate.keyword
    ? { ok: true }
    : {
        ok: false,
        reason: 'wrong',
        message: `Vui lòng nhập chính xác từ khóa "${gate.keyword}" để tiếp tục.`,
      };
}

export function remainingRestoreAttempts(failedAttempts: number): number {
  return Math.max(0, MAX_RESTORE_ATTEMPTS - failedAttempts);
}

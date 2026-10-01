/** Sự kiện toàn cục: API báo phiên bị khoá → layout hiện màn khoá PIN. */
export const APP_LOCK_EVENT = 'fcare:app-locked';

export type PinCodeAction = { kind: 'redirect'; href: string } | { kind: 'lock' } | null;

/**
 * Tách khỏi `pin-lock.ts` để `api.ts` dùng được mà không vòng import.
 * APP_LOCKED không đổi trang: nội dung đang soạn phải còn nguyên sau khi mở khoá.
 */
export function pinActionForCode(code: string | undefined): PinCodeAction {
  switch (code) {
    case 'PIN_SETUP_REQUIRED':
      return { kind: 'redirect', href: '/setup-pin' };
    case 'PIN_ATTEMPTS_EXCEEDED':
      return { kind: 'redirect', href: '/login' };
    case 'APP_LOCKED':
      return { kind: 'lock' };
    default:
      return null;
  }
}

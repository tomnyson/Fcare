const SESSION_KEY = 'fcare_system_pin_unlocked';

/**
 * Trả về true nếu env var NEXT_PUBLIC_SYSTEM_PIN là chuỗi 6 chữ số hợp lệ.
 * Nếu không có hoặc không đúng định dạng → PIN không được kích hoạt.
 */
export function isSystemPinEnabled(): boolean {
  const pin = process.env.NEXT_PUBLIC_SYSTEM_PIN ?? '';
  return /^\d{6}$/.test(pin);
}

/** So sánh input với PIN trong env. */
export function verifySystemPin(input: string): boolean {
  const pin = process.env.NEXT_PUBLIC_SYSTEM_PIN ?? '';
  return input === pin;
}

/** Kiểm tra phiên hiện tại đã unlock chưa (sessionStorage). */
export function isSystemPinUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    // sessionStorage có thể throw trong môi trường SSR
    return false;
  }
}

/** Đánh dấu phiên hiện tại đã unlock — tồn tại đến khi đóng tab. */
export function unlockSystemPin(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Bỏ qua nếu sessionStorage không khả dụng
  }
}

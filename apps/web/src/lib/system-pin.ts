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


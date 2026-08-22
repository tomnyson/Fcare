import { randomInt } from 'node:crypto';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;

/**
 * Sinh mật khẩu tạm 12 ký tự (đảm bảo có cả chữ và số, bỏ ký tự dễ nhầm lẫn).
 * Dùng cho luồng cấp lại mật khẩu qua admin — hệ thống không lưu email nên
 * không có kênh reset tự động.
 */
export function generateTempPassword(): string {
  const characters = [
    LETTERS[randomInt(LETTERS.length)],
    DIGITS[randomInt(DIGITS.length)],
  ];
  for (let index = 2; index < 12; index += 1) {
    characters.push(ALL[randomInt(ALL.length)]);
  }
  // Trộn vị trí bằng Fisher–Yates với randomInt an toàn.
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [characters[index], characters[swap]] = [
      characters[swap],
      characters[index],
    ];
  }
  return characters.join('');
}

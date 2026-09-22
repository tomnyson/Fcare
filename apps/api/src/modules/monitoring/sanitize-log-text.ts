import { detectPii } from '../../common/utils/pii-text';

/**
 * Che PII (RULE 1) và bí mật trong log lỗi TRƯỚC khi ghi DB hoặc gửi Discord.
 *
 * Hai lớp:
 *  1. Regex thay thế các dạng dễ nhận biết (email, SĐT, CCCD/CMND, IP, JWT,
 *     token, mật khẩu, chuỗi kết nối, webhook) — giữ phần còn lại để debug.
 *  2. Mỗi dòng còn lại chạy qua `detectPii` (bộ dò chuẩn của dự án, bắt cả
 *     dạng viết giãn/ký tự lạ). Còn dấu hiệu → ẩn CẢ dòng. Chấp nhận mất một
 *     dòng log hơn là lọt PII.
 */
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 4000;
export const HIDDEN_LINE = '[dòng log đã ẩn: có thể chứa thông tin cá nhân]';

const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Webhook trước email/URL: URL chứa token bí mật.
  [
    /https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi,
    '[discord-webhook]',
  ],
  // postgres://user:pass@host → postgres://[ẩn]@host
  [/([a-z][\w+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, '$1[ẩn]@'],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'],
  [/\bBearer\s+[\w.~+/-]+=*/gi, 'Bearer [ẩn]'],
  [
    /\b(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    '$1$2[ẩn]',
  ],
  [/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi, '[email]'],
  [/(?<![\w.])(?:\+84|84|0)\d{9}(?!\d)/g, '[số điện thoại]'],
  [/(?<![\w.])(?:\d{12}|\d{9})(?!\d)/g, '[mã số]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
];

export function sanitizeLogText(text: string): string {
  return REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

function sanitizeLines(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const cleaned = sanitizeLogText(line);
      return detectPii(cleaned) ? HIDDEN_LINE : cleaned;
    })
    .join('\n');
}

export function sanitizeLogMessage(text: string): string {
  const cleaned = sanitizeLines(text.trim()) || '(không có nội dung)';
  return cleaned.slice(0, MAX_MESSAGE_LENGTH);
}

export function sanitizeStack(stack: string | undefined | null): string | null {
  if (!stack) return null;
  // Cắt TRƯỚC khi dò để chi phí có trần; stack dài chỉ cần phần đầu.
  const cleaned = sanitizeLines(stack.slice(0, MAX_STACK_LENGTH * 2));
  return cleaned.slice(0, MAX_STACK_LENGTH) || null;
}

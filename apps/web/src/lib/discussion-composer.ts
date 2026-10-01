/**
 * Hàm thuần cho ô soạn tin trao đổi: bọc đậm/nghiêng, bật-tắt danh sách, gợi ý
 * `@`. Tách khỏi component để test không cần DOM.
 */

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface MentionQuery {
  /** Vị trí ký tự `@`. */
  start: number;
  query: string;
}

export interface Mentionable {
  id: string;
  staffCode: string;
  fullName: string;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const MENTION_TAIL = /^[\p{L}\p{N}._-]*$/u;
const BULLET_PREFIX = /^\s*[-*•]\s+/;
const ORDERED_PREFIX = /^\s*\d{1,3}[.)]\s+/;

/** Bọc vùng chọn bằng `marker`; nếu đã được bọc sẵn thì gỡ ra. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  marker: string,
): TextEdit {
  const size = marker.length;
  const wrapped =
    start >= size &&
    value.slice(start - size, start) === marker &&
    value.slice(end, end + size) === marker;
  if (wrapped && end > start) {
    return {
      value: value.slice(0, start - size) + value.slice(start, end) + value.slice(end + size),
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }
  return {
    value: value.slice(0, start) + marker + value.slice(start, end) + marker + value.slice(end),
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}

/** Thêm/gỡ tiền tố danh sách cho mọi dòng chạm vùng chọn. */
export function toggleListPrefix(
  value: string,
  start: number,
  end: number,
  ordered: boolean,
): TextEdit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const prefix = ordered ? ORDERED_PREFIX : BULLET_PREFIX;
  const allListed = lines.every((line) => prefix.test(line));
  const nextLines = allListed
    ? lines.map((line) => line.replace(prefix, ''))
    : lines.map((line, index) => {
        const bare = line.replace(BULLET_PREFIX, '').replace(ORDERED_PREFIX, '');
        return `${ordered ? `${index + 1}.` : '-'} ${bare}`;
      });
  const block = nextLines.join('\n');
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}

/** `@truy-vấn` đang gõ ngay trước con trỏ, hoặc null nếu không ở trong một nhắc tên. */
export function activeMentionQuery(value: string, caret: number): MentionQuery | null {
  const at = value.lastIndexOf('@', caret - 1);
  if (at === -1) return null;
  const prev = at > 0 ? value[at - 1] : undefined;
  if (prev !== undefined && (WORD_CHAR.test(prev) || prev === '@' || prev === '.')) return null;
  const query = value.slice(at + 1, caret);
  if (!MENTION_TAIL.test(query)) return null;
  return { start: at, query };
}

/** Thay `@truy-vấn` (từ `start` tới `caret`) bằng `@mã ` hoàn chỉnh. */
export function insertMention(
  value: string,
  start: number,
  caret: number,
  code: string,
): { value: string; caret: number } {
  const inserted = `@${code} `;
  return {
    value: value.slice(0, start) + inserted + value.slice(caret),
    caret: start + inserted.length,
  };
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Lọc người nhắc được theo mã hoặc họ tên, bỏ dấu tiếng Việt. */
export function filterMentionables<T extends Mentionable>(people: readonly T[], query: string): T[] {
  const needle = fold(query.trim());
  if (!needle) return [...people];
  return people.filter(
    (person) => fold(person.staffCode).includes(needle) || fold(person.fullName).includes(needle),
  );
}

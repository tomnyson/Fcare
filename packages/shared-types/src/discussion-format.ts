/**
 * Định dạng nhẹ cho tin trao đổi — lưu nguyên văn trong `DiscussionMessage.body`
 * (không cần migration), cả API lẫn web cùng đọc bằng bộ phân tích này:
 *
 * - `**đậm**`, `_nghiêng_` (gạch dưới giữa từ như `snake_case` giữ nguyên)
 * - dòng bắt đầu `- ` / `* ` → danh sách chấm; `1. ` / `1) ` → danh sách số
 * - `@all` / `@<mã nhân viên>` → nhắc tên (API gửi thông báo riêng)
 *
 * Kết quả là cây dữ liệu, KHÔNG phải HTML: web dựng thành phần tử React nên
 * không có đường nào để nội dung tin nhắn biến thành mã chạy trên trình duyệt.
 */

/** Từ khoá nhắc tất cả người liên quan tới sinh viên. */
export const MENTION_ALL = 'all';

/** Trần số mã nhân viên được nhắc trong một tin — chặn dội thông báo. */
export const MAX_MENTIONS = 20;

export interface TextToken {
  kind: 'text';
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface MentionToken {
  kind: 'mention';
  /** Mã như người gõ viết; so khớp không phân biệt hoa thường. */
  code: string;
  bold: boolean;
  italic: boolean;
}

export type InlineToken = TextToken | MentionToken;

export type DiscussionBlock =
  | { type: 'paragraph'; lines: InlineToken[][] }
  | { type: 'list'; ordered: boolean; items: InlineToken[][] };

export interface ExtractedMentions {
  all: boolean;
  /** Chữ thường, không trùng, tối đa `MAX_MENTIONS`, không chứa `all`. */
  staffCodes: string[];
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;
const MENTION_CODE = /^[\p{L}\p{N}][\p{L}\p{N}._-]*/u;
const TRAILING_CODE_PUNCT = /[._-]+$/;
const BULLET_LINE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_LINE = /^\s*\d{1,3}[.)]\s+(.*)$/;

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch);
}

function hasSolidEdges(inner: string): boolean {
  return inner.length > 0 && inner.trim() === inner;
}

/** Vị trí `_` đóng hợp lệ (không dính chữ phía sau), hoặc -1. */
function findItalicClose(text: string, from: number): number {
  for (let j = text.indexOf('_', from); j !== -1; j = text.indexOf('_', j + 1)) {
    if (!isWordChar(text[j + 1])) return j;
  }
  return -1;
}

function pushText(tokens: InlineToken[], text: string, bold: boolean, italic: boolean): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last?.kind === 'text' && last.bold === bold && last.italic === italic) {
    tokens[tokens.length - 1] = { ...last, text: last.text + text };
    return;
  }
  tokens.push({ kind: 'text', text, bold, italic });
}

function appendAll(tokens: InlineToken[], more: InlineToken[]): void {
  for (const token of more) {
    if (token.kind === 'text') pushText(tokens, token.text, token.bold, token.italic);
    else tokens.push(token);
  }
}

/** Phân tích một dòng thành các đoạn chữ / nhắc tên kèm cờ đậm-nghiêng. */
export function parseInline(text: string, bold = false, italic = false): InlineToken[] {
  const tokens: InlineToken[] = [];
  let buffer = '';
  let i = 0;
  const flush = () => {
    pushText(tokens, buffer, bold, italic);
    buffer = '';
  };

  while (i < text.length) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : undefined;

    if (ch === '*' && text[i + 1] === '*') {
      const close = text.indexOf('**', i + 2);
      const inner = close === -1 ? '' : text.slice(i + 2, close);
      if (hasSolidEdges(inner)) {
        flush();
        appendAll(tokens, parseInline(inner, true, italic));
        i = close + 2;
        continue;
      }
    }

    if (ch === '_' && !isWordChar(prev)) {
      const close = findItalicClose(text, i + 1);
      const inner = close === -1 ? '' : text.slice(i + 1, close);
      if (hasSolidEdges(inner)) {
        flush();
        appendAll(tokens, parseInline(inner, bold, true));
        i = close + 1;
        continue;
      }
    }

    if (ch === '@' && !isWordChar(prev) && prev !== '@' && prev !== '.') {
      const match = MENTION_CODE.exec(text.slice(i + 1));
      const code = match ? match[0].replace(TRAILING_CODE_PUNCT, '') : '';
      if (code) {
        flush();
        tokens.push({ kind: 'mention', code, bold, italic });
        i += 1 + code.length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return tokens;
}

/** Tách nội dung thành đoạn văn / danh sách. */
export function parseDiscussionBody(body: string): DiscussionBlock[] {
  const blocks: DiscussionBlock[] = [];
  let current: DiscussionBlock | null = null;
  const close = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET_LINE.exec(line);
    const ordered = bullet ? null : ORDERED_LINE.exec(line);
    const item = bullet ?? ordered;

    if (item) {
      const isOrdered = ordered !== null;
      if (current?.type !== 'list' || current.ordered !== isOrdered) {
        close();
        current = { type: 'list', ordered: isOrdered, items: [] };
      }
      current.items.push(parseInline(item[1] ?? ''));
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    if (current?.type !== 'paragraph') {
      close();
      current = { type: 'paragraph', lines: [] };
    }
    current.lines.push(parseInline(line));
  }
  close();
  return blocks;
}

function blockLines(block: DiscussionBlock): InlineToken[][] {
  return block.type === 'paragraph' ? block.lines : block.items;
}

/** Người được nhắc trong tin — nguồn duy nhất cho API khi gửi thông báo. */
export function extractMentions(body: string): ExtractedMentions {
  let all = false;
  const codes = new Set<string>();
  for (const block of parseDiscussionBody(body)) {
    for (const line of blockLines(block)) {
      for (const token of line) {
        if (token.kind !== 'mention') continue;
        const code = token.code.toLowerCase();
        if (code === MENTION_ALL) all = true;
        else if (codes.size < MAX_MENTIONS) codes.add(code);
      }
    }
  }
  return { all, staffCodes: [...codes] };
}

function plainLine(tokens: InlineToken[]): string {
  return tokens.map((token) => (token.kind === 'text' ? token.text : `@${token.code}`)).join('');
}

/** Bản chữ trơn (bỏ `**`, `_`) — dùng cho xem trước trong chuông thông báo. */
export function stripFormatting(body: string): string {
  return parseDiscussionBody(body)
    .map((block) => {
      if (block.type === 'paragraph') return block.lines.map(plainLine).join('\n');
      return block.items
        .map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${plainLine(item)}`)
        .join('\n');
    })
    .join('\n');
}

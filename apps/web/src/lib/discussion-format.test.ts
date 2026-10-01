import {
  extractMentions,
  MAX_MENTIONS,
  parseDiscussionBody,
  parseInline,
  stripFormatting,
} from '@fcare/shared-types';
import { describe, expect, it } from 'vitest';

const text = (value: string, bold = false, italic = false) => ({
  kind: 'text',
  text: value,
  bold,
  italic,
});

describe('parseInline — đậm, nghiêng, nhắc tên', () => {
  it('chữ thường giữ nguyên', () => {
    expect(parseInline('Xin chào')).toEqual([text('Xin chào')]);
  });

  it('**đậm** và _nghiêng_', () => {
    expect(parseInline('a **b** _c_ d')).toEqual([
      text('a '),
      text('b', true),
      text(' '),
      text('c', false, true),
      text(' d'),
    ]);
  });

  it('lồng nghiêng trong đậm', () => {
    expect(parseInline('**x _y_**')).toEqual([text('x ', true), text('y', true, true)]);
  });

  it('gạch dưới giữa từ (tên biến, mã) không phải nghiêng', () => {
    expect(parseInline('snake_case_name')).toEqual([text('snake_case_name')]);
  });

  it('dấu ** không đóng thì là chữ', () => {
    expect(parseInline('2 ** 3')).toEqual([text('2 ** 3')]);
  });

  it('@mã nhân viên, bỏ dấu chấm cuối câu', () => {
    expect(parseInline('nhờ @gv.binh.')).toEqual([
      text('nhờ '),
      { kind: 'mention', code: 'gv.binh', bold: false, italic: false },
      text('.'),
    ]);
  });

  it('@ dính sau chữ (kiểu địa chỉ) không phải nhắc tên', () => {
    expect(parseInline('abc@gv.binh')).toEqual([text('abc@gv.binh')]);
  });

  it('nhắc tên trong đoạn đậm vẫn nhận', () => {
    expect(parseInline('**@all xem**')).toEqual([
      { kind: 'mention', code: 'all', bold: true, italic: false },
      text(' xem', true),
    ]);
  });
});

describe('parseDiscussionBody — khối đoạn văn và danh sách', () => {
  it('đoạn nhiều dòng giữ xuống dòng; dòng trống tách đoạn', () => {
    const blocks = parseDiscussionBody('dòng 1\ndòng 2\n\ndòng 3');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[text('dòng 1')], [text('dòng 2')]] },
      { type: 'paragraph', lines: [[text('dòng 3')]] },
    ]);
  });

  it('danh sách gạch đầu dòng và đánh số', () => {
    const blocks = parseDiscussionBody('Việc:\n- một\n- **hai**\n1. ba\n2. bốn');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[text('Việc:')]] },
      { type: 'list', ordered: false, items: [[text('một')], [text('hai', true)]] },
      { type: 'list', ordered: true, items: [[text('ba')], [text('bốn')]] },
    ]);
  });
});

describe('extractMentions', () => {
  it('gom @all và mã nhân viên, không phân biệt hoa thường, không trùng', () => {
    expect(extractMentions('@ALL @gv.Binh @gv.binh _@tbm.se_ abc@x')).toEqual({
      all: true,
      staffCodes: ['gv.binh', 'tbm.se'],
    });
  });

  it('giới hạn số người được nhắc trong một tin', () => {
    const body = Array.from({ length: MAX_MENTIONS + 5 }, (_, i) => `@gv${i}`).join(' ');
    expect(extractMentions(body).staffCodes).toHaveLength(MAX_MENTIONS);
  });
});

describe('stripFormatting — xem trước trong thông báo', () => {
  it('bỏ dấu định dạng, giữ chữ và @mã', () => {
    expect(stripFormatting('**Gấp**: _xem_ @gv.binh\n- một')).toBe('Gấp: xem @gv.binh\n• một');
  });
});

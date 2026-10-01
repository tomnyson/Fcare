import { describe, expect, it } from 'vitest';
import {
  activeMentionQuery,
  filterMentionables,
  insertMention,
  toggleListPrefix,
  wrapSelection,
} from './discussion-composer';

describe('wrapSelection — Ctrl+B / Ctrl+I', () => {
  it('bọc đoạn đang chọn và giữ vùng chọn bên trong dấu', () => {
    expect(wrapSelection('xin chào bạn', 4, 8, '**')).toEqual({
      value: 'xin **chào** bạn',
      selectionStart: 6,
      selectionEnd: 10,
    });
  });

  it('không chọn gì → chèn cặp dấu và đặt con trỏ ở giữa', () => {
    expect(wrapSelection('ab', 1, 1, '_')).toEqual({
      value: 'a__b',
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('bấm lại lần nữa trên đoạn đã bọc → gỡ dấu', () => {
    expect(wrapSelection('xin **chào** bạn', 6, 10, '**')).toEqual({
      value: 'xin chào bạn',
      selectionStart: 4,
      selectionEnd: 8,
    });
  });
});

describe('toggleListPrefix — nút danh sách', () => {
  it('thêm "- " cho mọi dòng trong vùng chọn', () => {
    const result = toggleListPrefix('một\nhai', 0, 7, false);
    expect(result.value).toBe('- một\n- hai');
  });

  it('danh sách số đánh 1., 2., …', () => {
    expect(toggleListPrefix('một\nhai', 0, 7, true).value).toBe('1. một\n2. hai');
  });

  it('các dòng đã là danh sách cùng loại → gỡ tiền tố', () => {
    expect(toggleListPrefix('- một\n- hai', 0, 11, false).value).toBe('một\nhai');
  });
});

describe('activeMentionQuery — gợi ý @', () => {
  it('nhận chuỗi sau @ ngay trước con trỏ', () => {
    expect(activeMentionQuery('nhờ @gv.b', 9)).toEqual({ start: 4, query: 'gv.b' });
  });

  it('@ ngay đầu dòng, chưa gõ gì', () => {
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
  });

  it('@ dính sau chữ (kiểu địa chỉ) không mở gợi ý', () => {
    expect(activeMentionQuery('abc@gv', 6)).toBeNull();
  });

  it('đã có khoảng trắng sau mã → đóng gợi ý', () => {
    expect(activeMentionQuery('@gv.b xem', 9)).toBeNull();
  });
});

describe('insertMention', () => {
  it('thay @truy-vấn bằng @mã và một khoảng trắng', () => {
    expect(insertMention('nhờ @gv xem', 4, 7, 'gv.binh')).toEqual({
      value: 'nhờ @gv.binh  xem',
      caret: 13,
    });
  });
});

describe('filterMentionables', () => {
  const people = [
    { id: '1', staffCode: 'gv.binh', fullName: 'Trần Văn Bình' },
    { id: '2', staffCode: 'tbm.se', fullName: 'Lê Thị Hoa' },
  ];

  it('khớp mã hoặc tên, không phân biệt dấu và hoa thường', () => {
    expect(filterMentionables(people, 'binh').map((p) => p.id)).toEqual(['1']);
    expect(filterMentionables(people, 'HOA').map((p) => p.id)).toEqual(['2']);
    expect(filterMentionables(people, 'tbm').map((p) => p.id)).toEqual(['2']);
  });

  it('truy vấn rỗng → trả tất cả', () => {
    expect(filterMentionables(people, '')).toHaveLength(2);
  });
});

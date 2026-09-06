import { describe, expect, it } from 'vitest';
import {
  IMPORT_KINDS,
  isSharedAssignmentFile,
  orderImportKinds,
  toggleImportKind,
} from './import-kinds';

describe('orderImportKinds', () => {
  it('sắp xếp theo thứ tự import bắt buộc bất kể thứ tự người dùng tick', () => {
    expect(orderImportKinds(['schedule', 'catalog', 'lecturer'])).toEqual([
      'catalog',
      'lecturer',
      'schedule',
    ]);
  });

  it('loại bỏ trùng lặp và giữ nguyên khi chỉ có một loại', () => {
    expect(orderImportKinds(['lecturer', 'lecturer'])).toEqual(['lecturer']);
    expect(orderImportKinds(['gradebook'])).toEqual(['gradebook']);
    expect(orderImportKinds([])).toEqual([]);
  });
});

describe('toggleImportKind', () => {
  it('thêm loại cùng file phân công vào lựa chọn đang có', () => {
    expect(toggleImportKind(['catalog'], 'schedule')).toEqual(['catalog', 'schedule']);
  });

  it('bỏ tick loại đã chọn', () => {
    expect(toggleImportKind(['catalog', 'lecturer'], 'catalog')).toEqual(['lecturer']);
  });

  it('bảng điểm là lựa chọn loại trừ: tick nó thì bỏ hết loại cùng file phân công', () => {
    expect(toggleImportKind(['catalog', 'lecturer'], 'gradebook')).toEqual(['gradebook']);
  });

  it('tick loại cùng file phân công khi đang chọn bảng điểm thì bỏ bảng điểm', () => {
    expect(toggleImportKind(['gradebook'], 'lecturer')).toEqual(['lecturer']);
  });

  it('luôn trả về mảng mới, không sửa mảng đầu vào', () => {
    const before: Array<'catalog' | 'lecturer'> = ['catalog'];
    const after = toggleImportKind(before, 'lecturer');
    expect(before).toEqual(['catalog']);
    expect(after).not.toBe(before);
  });
});

describe('isSharedAssignmentFile', () => {
  it('ba loại đầu đọc từ cùng file phân công, bảng điểm thì không', () => {
    const shared = IMPORT_KINDS.filter((kind) => isSharedAssignmentFile(kind.slug)).map(
      (kind) => kind.slug,
    );
    expect(shared).toEqual(['catalog', 'lecturer', 'schedule']);
    expect(isSharedAssignmentFile('gradebook')).toBe(false);
  });
});

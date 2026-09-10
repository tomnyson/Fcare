import { describe, expect, it } from 'vitest';
import {
  IMPORT_KIND_LABEL_BY_KIND,
  IMPORT_KINDS,
  IMPORT_PAYLOAD_COLUMNS,
  isSharedAssignmentFile,
  orderImportKinds,
  slugOfKind,
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

  it('bộ ba file đầu kỳ luôn xếp đúng thứ tự phụ thuộc', () => {
    expect(orderImportKinds(['grade-attendance', 'roster', 'section-list'])).toEqual([
      'section-list',
      'roster',
      'grade-attendance',
    ]);
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

  it('hai file đầu kỳ khác nhau không tick chung được', () => {
    expect(toggleImportKind(['section-list'], 'roster')).toEqual(['roster']);
    expect(toggleImportKind(['catalog', 'lecturer'], 'section-list')).toEqual(['section-list']);
    expect(toggleImportKind(['grade-attendance'], 'gradebook')).toEqual(['gradebook']);
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

describe('slugOfKind', () => {
  it('SECTION_LIST và GRADE_ATTENDANCE ra slug gạch nối, không phải gạch dưới', () => {
    expect(slugOfKind('SECTION_LIST')).toBe('section-list');
    expect(slugOfKind('GRADE_ATTENDANCE')).toBe('grade-attendance');
  });

  it('mọi loại trong bảng đều ánh xạ ngược đúng slug của chính nó', () => {
    for (const kind of IMPORT_KINDS) {
      expect(slugOfKind(kind.kind)).toBe(kind.slug);
    }
  });
});

describe('IMPORT_PAYLOAD_COLUMNS', () => {
  it('mọi loại import đều khai báo allowlist cột xem trước', () => {
    for (const kind of IMPORT_KINDS) {
      expect(IMPORT_PAYLOAD_COLUMNS[kind.kind].length).toBeGreaterThan(0);
    }
  });

  it('không loại nào lộ cột PII bị cấm (RULE 1)', () => {
    const forbidden = /cccd|cmnd|email|điện thoại|địa chỉ|phone|address/i;
    for (const columns of Object.values(IMPORT_PAYLOAD_COLUMNS)) {
      for (const column of columns) {
        expect(`${column.key} ${column.label}`).not.toMatch(forbidden);
      }
    }
  });
});

describe('IMPORT_KIND_LABEL_BY_KIND', () => {
  it('tra được nhãn theo giá trị ImportKind của API, kể cả loại có gạch dưới', () => {
    expect(IMPORT_KIND_LABEL_BY_KIND.SECTION_LIST).toBe('Đầu kỳ 1/3 — Danh sách lớp');
    expect(IMPORT_KIND_LABEL_BY_KIND.GRADE_ATTENDANCE).toBe('Đầu kỳ 3/3 — Điểm và chuyên cần');
  });

  it('phủ hết mọi loại trong bảng', () => {
    for (const kind of IMPORT_KINDS) {
      expect(IMPORT_KIND_LABEL_BY_KIND[kind.kind]).toBe(kind.label);
    }
  });
});

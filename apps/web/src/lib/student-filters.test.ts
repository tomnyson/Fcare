import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  buildStudentListQuery,
  clearFiltersPatch,
  parseStudentFilters,
} from './student-filters';

function params(init: Record<string, string>) {
  return new URLSearchParams(init);
}

describe('parseStudentFilters', () => {
  it('đọc đủ bộ lọc từ URL', () => {
    expect(
      parseStudentFilters(
        params({
          search: 'an',
          status: 'WARNED',
          classCode: 'SE1901',
          majorId: 'mj-1',
          term: 'SU25',
          lecturerId: 'gv-1',
          sectionId: 'cs-1',
          missingMajor: 'true',
        }),
      ),
    ).toEqual({
      search: 'an',
      status: 'WARNED',
      classCode: 'SE1901',
      majorId: 'mj-1',
      term: 'SU25',
      lecturerId: 'gv-1',
      sectionId: 'cs-1',
      missingMajor: true,
    });
  });

  it('URL trống cho bộ lọc rỗng, không cho undefined', () => {
    const filters = parseStudentFilters(params({}));
    expect(filters).toEqual({
      search: '',
      status: '',
      classCode: '',
      majorId: '',
      term: '',
      lecturerId: '',
      sectionId: '',
      missingMajor: false,
    });
  });

  it('missingMajor chỉ bật với đúng chuỗi "true"', () => {
    expect(parseStudentFilters(params({ missingMajor: '1' })).missingMajor).toBe(false);
  });
});

describe('buildStudentListQuery', () => {
  it('luôn gửi page và limit', () => {
    const query = buildStudentListQuery(parseStudentFilters(params({})), 2, 20);
    expect(query.get('page')).toBe('2');
    expect(query.get('limit')).toBe('20');
  });

  it('bỏ qua mọi bộ lọc rỗng', () => {
    const query = buildStudentListQuery(parseStudentFilters(params({})), 1, 20);
    expect([...query.keys()].sort()).toEqual(['limit', 'page']);
  });

  it('gửi đủ bộ lọc đang bật', () => {
    const query = buildStudentListQuery(
      parseStudentFilters(
        params({ term: 'SU25', lecturerId: 'gv-1', classCode: 'SE1901', majorId: 'mj-1' }),
      ),
      1,
      20,
    );
    expect(query.get('term')).toBe('SU25');
    expect(query.get('lecturerId')).toBe('gv-1');
    expect(query.get('classCode')).toBe('SE1901');
    expect(query.get('majorId')).toBe('mj-1');
  });

  it('gửi sectionId khi lọc theo một lớp học phần', () => {
    const query = buildStudentListQuery(
      parseStudentFilters(params({ sectionId: 'cs-1' })),
      1,
      20,
    );
    expect(query.get('sectionId')).toBe('cs-1');
  });

  it('không gửi majorId kèm missingMajor — hai bộ lọc mâu thuẫn nhau', () => {
    const query = buildStudentListQuery(
      parseStudentFilters(params({ majorId: 'mj-1', missingMajor: 'true' })),
      1,
      20,
    );
    expect(query.get('missingMajor')).toBe('true');
    expect(query.has('majorId')).toBe(false);
  });

  it('cắt khoảng trắng thừa của từ khóa tìm kiếm', () => {
    const query = buildStudentListQuery(
      parseStudentFilters(params({ search: '  an  ' })),
      1,
      20,
    );
    expect(query.get('search')).toBe('an');
  });
});

describe('activeFilterCount', () => {
  it('không có bộ lọc nào thì bằng 0', () => {
    expect(activeFilterCount(parseStudentFilters(params({})))).toBe(0);
  });

  it('đếm cả checkbox lẫn select', () => {
    expect(
      activeFilterCount(
        parseStudentFilters(params({ term: 'SU25', missingMajor: 'true', search: 'an' })),
      ),
    ).toBe(3);
  });

  it('majorId bị vô hiệu bởi missingMajor thì không được tính hai lần', () => {
    expect(
      activeFilterCount(parseStudentFilters(params({ majorId: 'mj-1', missingMajor: 'true' }))),
    ).toBe(1);
  });
});

describe('clearFiltersPatch', () => {
  it('xóa mọi khóa bộ lọc kể cả số trang', () => {
    const patch = clearFiltersPatch();
    expect(Object.values(patch).every((value) => value === null)).toBe(true);
    expect(Object.keys(patch).sort()).toEqual([
      'classCode',
      'lecturerId',
      'majorId',
      'missingMajor',
      'page',
      'search',
      'sectionId',
      'status',
      'term',
    ]);
  });
});

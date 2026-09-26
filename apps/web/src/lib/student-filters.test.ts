import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  buildStudentListQuery,
  clearFiltersPatch,
  majorsForClass,
  nextStudentSort,
  parseStudentSort,
  studentCareHref,
  studentSortPatch,
  parseStudentFilters,
  defaultLecturerFilter,
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
          alertLevel: '3',
        }),
      ),
    ).toEqual({
      search: 'an',
      status: 'WARNED',
      classCode: 'SE1901',
      majorId: 'mj-1',
      departmentId: '',
      term: 'SU25',
      lecturerId: 'gv-1',
      sectionId: 'cs-1',
      missingMajor: true,
      alertLevel: '3',
    });
  });

  it('URL trống cho bộ lọc rỗng, không cho undefined', () => {
    const filters = parseStudentFilters(params({}));
    expect(filters).toEqual({
      search: '',
      status: '',
      classCode: '',
      majorId: '',
      departmentId: '',
      term: '',
      lecturerId: '',
      sectionId: '',
      missingMajor: false,
      alertLevel: '',
    });
  });

  it('mức cảnh báo lạ trong URL bị bỏ qua', () => {
    expect(parseStudentFilters(params({ alertLevel: '9' })).alertLevel).toBe('');
    expect(parseStudentFilters(params({ alertLevel: 'any' })).alertLevel).toBe('any');
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
    const query = buildStudentListQuery(parseStudentFilters(params({ sectionId: 'cs-1' })), 1, 20);
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
    const query = buildStudentListQuery(parseStudentFilters(params({ search: '  an  ' })), 1, 20);
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

  it('đếm cả bộ lọc mức cảnh báo', () => {
    expect(activeFilterCount(parseStudentFilters(params({ alertLevel: 'any' })))).toBe(1);
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
      'alertLevel',
      'classCode',
      'departmentId',
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

describe('majorsForClass', () => {
  const majors = [
    { id: 'mj-web', code: 'WEB', name: 'Lập trình web' },
    { id: 'mj-mkt', code: 'MKT', name: 'Digital Marketing' },
  ];
  const classMajors = { CNTT: ['mj-web'], KT: ['mj-mkt'], MOI: [] };

  it('chưa chọn lớp thì giữ mọi ngành', () => {
    expect(majorsForClass(majors, classMajors, '')).toEqual(majors);
  });

  it('chọn lớp thì chỉ còn ngành có sinh viên trong lớp đó', () => {
    expect(majorsForClass(majors, classMajors, 'CNTT')).toEqual([majors[0]]);
  });

  it('lớp chỉ có sinh viên chưa gán ngành thì không còn ngành nào', () => {
    expect(majorsForClass(majors, classMajors, 'MOI')).toEqual([]);
  });

  it('API cũ chưa trả classMajors thì không lọc', () => {
    expect(majorsForClass(majors, undefined, 'CNTT')).toEqual(majors);
  });
});

describe('studentCareHref', () => {
  it('mở thẳng tab Nhật ký chăm sóc', () => {
    expect(studentCareHref('sv-1', '')).toBe('/students/sv-1?tab=care-logs');
  });

  it('giữ học kỳ đang lọc để trang chi tiết mở đúng kỳ', () => {
    expect(studentCareHref('sv-1', 'FA26')).toBe('/students/sv-1?tab=care-logs&term=FA26');
  });
});

describe('parseStudentSort', () => {
  it('đọc cột và chiều sắp xếp hợp lệ', () => {
    expect(parseStudentSort(params({ sortBy: 'absentSessions', sortDir: 'asc' }))).toEqual({
      by: 'absentSessions',
      dir: 'asc',
    });
  });

  it('thiếu chiều thì mặc định giảm dần (nhiều nhất lên đầu)', () => {
    expect(parseStudentSort(params({ sortBy: 'openAlerts' }))).toEqual({
      by: 'openAlerts',
      dir: 'desc',
    });
  });

  it('bỏ qua giá trị lạ trong URL — không gửi rác lên API', () => {
    expect(parseStudentSort(params({ sortBy: 'fullName' }))).toEqual({ by: 'risk', dir: 'desc' });
    expect(parseStudentSort(params({ sortBy: 'openAlerts', sortDir: 'up' }))).toEqual({
      by: 'openAlerts',
      dir: 'desc',
    });
  });
});

describe('parseStudentSort — mặc định theo nguy cơ', () => {
  it('URL chưa chọn sắp xếp → sinh viên nguy cơ cao lên đầu', () => {
    expect(parseStudentSort(params({}))).toEqual({ by: 'risk', dir: 'desc' });
  });

  it('bỏ sắp xếp cột (patch null) thì quay về mặc định nguy cơ', () => {
    const cleared = params({});
    for (const [key, value] of Object.entries(studentSortPatch(null))) {
      if (value) cleared.set(key, value);
    }
    expect(parseStudentSort(cleared)).toEqual({ by: 'risk', dir: 'desc' });
  });
});

describe('buildStudentListQuery — mức cảnh báo', () => {
  it('gửi alertLevel khi có', () => {
    const query = buildStudentListQuery(parseStudentFilters(params({ alertLevel: '2' })), 1, 20);
    expect(query.get('alertLevel')).toBe('2');
  });
});

describe('defaultLecturerFilter — giảng viên mặc định xem lớp mình dạy', () => {
  it('giảng viên thuần → chính mình', () => {
    expect(defaultLecturerFilter(['LECTURER'], 'gv-1')).toBe('gv-1');
  });

  it('trưởng bộ môn / admin / đào tạo / CTSV → không mặc định (xem toàn phạm vi)', () => {
    expect(defaultLecturerFilter(['LECTURER', 'HEAD_OF_DEPT'], 'h')).toBe('');
    expect(defaultLecturerFilter(['ADMIN'], 'a')).toBe('');
    expect(defaultLecturerFilter(['TRAINING_OFFICER'], 't')).toBe('');
    expect(defaultLecturerFilter(['SA_OFFICER'], 's')).toBe('');
  });
});

describe('nextStudentSort', () => {
  it('bấm cột mới bắt đầu từ giảm dần', () => {
    expect(nextStudentSort(null, 'absentSessions')).toEqual({ by: 'absentSessions', dir: 'desc' });
    expect(nextStudentSort({ by: 'openAlerts', dir: 'asc' }, 'absentSessions')).toEqual({
      by: 'absentSessions',
      dir: 'desc',
    });
  });

  it('bấm lại cùng cột: giảm → tăng → bỏ sắp xếp', () => {
    expect(nextStudentSort({ by: 'openAlerts', dir: 'desc' }, 'openAlerts')).toEqual({
      by: 'openAlerts',
      dir: 'asc',
    });
    expect(nextStudentSort({ by: 'openAlerts', dir: 'asc' }, 'openAlerts')).toBeNull();
  });
});

describe('studentSortPatch', () => {
  it('ghi sắp xếp vào URL và quay về trang 1', () => {
    expect(studentSortPatch({ by: 'openAlerts', dir: 'asc' })).toEqual({
      sortBy: 'openAlerts',
      sortDir: 'asc',
      page: null,
    });
  });

  it('bỏ sắp xếp thì xoá khỏi URL', () => {
    expect(studentSortPatch(null)).toEqual({ sortBy: null, sortDir: null, page: null });
  });
});

describe('buildStudentListQuery — sắp xếp', () => {
  it('gửi sortBy/sortDir khi có', () => {
    const query = buildStudentListQuery(parseStudentFilters(params({})), 1, 20, {
      by: 'absentSessions',
      dir: 'asc',
    });
    expect(query.get('sortBy')).toBe('absentSessions');
    expect(query.get('sortDir')).toBe('asc');
  });

  it('không sắp xếp thì không gửi gì thêm', () => {
    const query = buildStudentListQuery(parseStudentFilters(params({})), 1, 20, null);
    expect(query.has('sortBy')).toBe(false);
  });

  it('sắp xếp không tính là bộ lọc đang áp dụng', () => {
    expect(activeFilterCount(parseStudentFilters(params({ sortBy: 'openAlerts' })))).toBe(0);
  });
});

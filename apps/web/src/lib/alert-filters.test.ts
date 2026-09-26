import { describe, expect, it } from 'vitest';
import {
  activeAlertFilterCount,
  alertLevelFilterOptions,
  alertSortPatch,
  buildAlertListQuery,
  clearAlertFiltersPatch,
  nextAlertSort,
  parseAlertFilters,
  parseAlertSort,
} from './alert-filters';

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

describe('parseAlertFilters', () => {
  it('đọc đủ bộ lọc từ URL', () => {
    expect(
      parseAlertFilters(
        params({
          search: 'an',
          status: 'OPEN',
          level: '4',
          term: 'SU25',
          classCode: 'SE1901',
          majorId: 'mj-1',
          lecturerId: 'gv-1',
          sectionId: 'cs-1',
          source: 'AUTO_ATTENDANCE',
        }),
      ),
    ).toEqual({
      search: 'an',
      status: 'OPEN',
      level: '4',
      term: 'SU25',
      classCode: 'SE1901',
      majorId: 'mj-1',
      departmentId: '',
      lecturerId: 'gv-1',
      sectionId: 'cs-1',
      openOnly: false,
      source: 'AUTO_ATTENDANCE',
    });
  });

  it('URL trống cho bộ lọc rỗng, không cho undefined', () => {
    expect(parseAlertFilters(params())).toEqual({
      search: '',
      status: '',
      level: '',
      term: '',
      classCode: '',
      majorId: '',
      departmentId: '',
      lecturerId: '',
      sectionId: '',
      openOnly: false,
      source: '',
    });
  });
});

describe('buildAlertListQuery', () => {
  it('chỉ gửi tham số có giá trị và luôn kèm limit', () => {
    const query = buildAlertListQuery(
      parseAlertFilters(params({ level: '4', sectionId: 'cs-1' })),
      50,
    );
    expect(query.get('limit')).toBe('50');
    expect(query.get('level')).toBe('4');
    expect(query.get('sectionId')).toBe('cs-1');
    expect(query.has('status')).toBe(false);
    expect(query.has('term')).toBe(false);
    expect(query.has('source')).toBe(false);
  });

  it('gửi nguồn cảnh báo để lọc riêng cảnh báo điểm danh tự động', () => {
    const query = buildAlertListQuery(parseAlertFilters(params({ source: 'AUTO_ATTENDANCE' })), 50);
    expect(query.get('source')).toBe('AUTO_ATTENDANCE');
  });

  it('chỉ gửi page khi > 1 — trang đầu giữ URL API gọn như trước', () => {
    const filters = parseAlertFilters(params({}));
    expect(buildAlertListQuery(filters, 20).has('page')).toBe(false);
    expect(buildAlertListQuery(filters, 20, 1).has('page')).toBe(false);
    expect(buildAlertListQuery(filters, 20, 3).get('page')).toBe('3');
  });

  it('cắt khoảng trắng của ô tìm kiếm', () => {
    const query = buildAlertListQuery(parseAlertFilters(params({ search: '  an  ' })), 50);
    expect(query.get('search')).toBe('an');
  });
});

describe('activeAlertFilterCount', () => {
  it('đếm đúng số bộ lọc đang áp dụng', () => {
    expect(activeAlertFilterCount(parseAlertFilters(params()))).toBe(0);
    expect(
      activeAlertFilterCount(parseAlertFilters(params({ level: '4', term: 'SU25', search: '  ' }))),
    ).toBe(2);
    expect(activeAlertFilterCount(parseAlertFilters(params({ source: 'MANUAL' })))).toBe(1);
  });
});

describe('clearAlertFiltersPatch', () => {
  it('xóa mọi khóa bộ lọc', () => {
    const patch = clearAlertFiltersPatch();
    expect(Object.keys(patch).sort()).toEqual([
      'classCode',
      'departmentId',
      'lecturerId',
      'level',
      'majorId',
      'openOnly',
      'search',
      'sectionId',
      'source',
      'status',
      'term',
    ]);
    expect(Object.values(patch).every((value) => value === null)).toBe(true);
  });
});

describe('sắp xếp cảnh báo theo độ khẩn / thời điểm', () => {
  it('URL chưa chọn cột → mặc định độ khẩn giảm dần (khẩn nhất lên đầu)', () => {
    expect(parseAlertSort(params())).toEqual({ by: 'level', dir: 'desc' });
    expect(parseAlertSort(params({ sortBy: 'bogus' }))).toEqual({ by: 'level', dir: 'desc' });
  });

  it('đọc cột + chiều từ URL', () => {
    expect(parseAlertSort(params({ sortBy: 'createdAt', sortDir: 'asc' }))).toEqual({
      by: 'createdAt',
      dir: 'asc',
    });
  });

  it('bấm tiêu đề: cột khác → giảm dần; cùng cột giảm → tăng; tăng → bỏ', () => {
    const level = { by: 'level', dir: 'desc' } as const;
    expect(nextAlertSort(level, 'createdAt')).toEqual({ by: 'createdAt', dir: 'desc' });
    expect(nextAlertSort(level, 'level')).toEqual({ by: 'level', dir: 'asc' });
    expect(nextAlertSort({ by: 'level', dir: 'asc' }, 'level')).toBeNull();
  });

  it('đổi sắp xếp quay về trang 1', () => {
    expect(alertSortPatch({ by: 'createdAt', dir: 'asc' })).toEqual({
      sortBy: 'createdAt',
      sortDir: 'asc',
      page: null,
    });
    expect(alertSortPatch(null)).toEqual({ sortBy: null, sortDir: null, page: null });
  });

  it('gửi sortBy/sortDir lên API', () => {
    const query = buildAlertListQuery(parseAlertFilters(params()), 10, 1, {
      by: 'level',
      dir: 'asc',
    });
    expect(query.get('sortBy')).toBe('level');
    expect(query.get('sortDir')).toBe('asc');
  });
});

describe('alertLevelFilterOptions — CTSV chỉ thấy mức 3 trở lên', () => {
  it('CTSV thuần chỉ có mức 3 và 4', () => {
    expect(alertLevelFilterOptions(['SA_OFFICER']).map((o) => o.value)).toEqual(['3', '4']);
    expect(alertLevelFilterOptions(['SA_HEAD', 'SA_OFFICER']).map((o) => o.value)).toEqual([
      '3',
      '4',
    ]);
  });

  it('vai trò khác (kể cả kiêm CTSV) và lúc chưa tải xong vai trò thấy đủ 1–4', () => {
    expect(alertLevelFilterOptions(['LECTURER']).map((o) => o.value)).toEqual(['1', '2', '3', '4']);
    expect(alertLevelFilterOptions(['ADMIN', 'SA_HEAD'])).toHaveLength(4);
    expect(alertLevelFilterOptions(undefined)).toHaveLength(4);
  });

  it('nhãn kèm tên mức', () => {
    expect(alertLevelFilterOptions(['SA_OFFICER'])[0].label).toMatch(/^Mức 3 — /);
  });
});

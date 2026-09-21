import { describe, expect, it } from 'vitest';
import {
  activeAlertFilterCount,
  buildAlertListQuery,
  clearAlertFiltersPatch,
  parseAlertFilters,
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
      lecturerId: 'gv-1',
      sectionId: 'cs-1',
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
      lecturerId: '',
      sectionId: '',
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
      'lecturerId',
      'level',
      'majorId',
      'search',
      'sectionId',
      'source',
      'status',
      'term',
    ]);
    expect(Object.values(patch).every((value) => value === null)).toBe(true);
  });
});

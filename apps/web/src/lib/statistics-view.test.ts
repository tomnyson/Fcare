import { describe, expect, it } from 'vitest';
import {
  buildStatisticsQuery,
  parseBlockParam,
  isStatisticsTabKey,
  parseStatisticsView,
  statisticsTabHref,
  visibleStatisticsTabs,
} from './statistics-view';

function params(init: Record<string, string> = {}) {
  return new URLSearchParams(init);
}

describe('parseStatisticsView', () => {
  it('đọc tab và học kỳ từ URL', () => {
    expect(parseStatisticsView(params({ tab: 'subjects', term: 'SU25' }))).toEqual({
      tab: 'subjects',
      term: 'SU25',
    });
  });

  it('URL trống thì mở tab lớp học phần', () => {
    expect(parseStatisticsView(params())).toEqual({ tab: 'classes', term: '' });
  });

  it('tab lạ trong URL không làm vỡ trang mà quay về mặc định', () => {
    expect(parseStatisticsView(params({ tab: 'khong-ton-tai' })).tab).toBe('classes');
  });
});

describe('buildStatisticsQuery', () => {
  it('không gửi tham số khi không lọc kỳ', () => {
    expect(buildStatisticsQuery('')).toBe('');
  });

  it('gửi kỳ khi có lọc', () => {
    expect(buildStatisticsQuery('SU25')).toBe('?term=SU25');
  });
});

describe('isStatisticsTabKey', () => {
  it('nhận đúng năm tab', () => {
    for (const key of ['classes', 'departments', 'subjects', 'lecturers', 'care']) {
      expect(isStatisticsTabKey(key)).toBe(true);
    }
    expect(isStatisticsTabKey('students')).toBe(false);
  });
});

describe('statisticsTabHref — mỗi tab là một route con của menu Thống kê', () => {
  it('giữ học kỳ đang chọn khi chuyển tab', () => {
    expect(statisticsTabHref('classes', 'FA26')).toBe('/statistics/classes?term=FA26');
  });

  it('không kèm query khi chưa chọn kỳ', () => {
    expect(statisticsTabHref('care', '')).toBe('/statistics/care');
  });
});

describe('visibleStatisticsTabs', () => {
  it('giảng viên không thấy tab chăm sóc sinh viên', () => {
    expect(visibleStatisticsTabs(['LECTURER']).map((tab) => tab.key)).toEqual([
      'classes',
      'departments',
      'subjects',
      'lecturers',
    ]);
  });

  it('TBM thấy đủ năm tab', () => {
    expect(visibleStatisticsTabs(['HEAD_OF_DEPT'])).toHaveLength(5);
  });
});

describe('bộ lọc block của tab lớp học phần', () => {
  it('chỉ nhận block 1 hoặc 2, còn lại coi như không lọc', () => {
    expect(parseBlockParam('1')).toBe('1');
    expect(parseBlockParam('2')).toBe('2');
    expect(parseBlockParam('3')).toBe('');
    expect(parseBlockParam(null)).toBe('');
  });

  it('query gồm kỳ + block khi có', () => {
    expect(buildStatisticsQuery('FA26', '2')).toBe('?term=FA26&block=2');
    expect(buildStatisticsQuery('', '1')).toBe('?block=1');
    expect(buildStatisticsQuery('FA26', '')).toBe('?term=FA26');
    expect(buildStatisticsQuery('')).toBe('');
  });
});

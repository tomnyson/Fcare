import { describe, expect, it } from 'vitest';
import {
  buildStatisticsQuery,
  isStatisticsTabKey,
  parseStatisticsView,
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
  it('nhận đúng bốn tab', () => {
    for (const key of ['classes', 'departments', 'subjects', 'lecturers']) {
      expect(isStatisticsTabKey(key)).toBe(true);
    }
    expect(isStatisticsTabKey('students')).toBe(false);
  });
});

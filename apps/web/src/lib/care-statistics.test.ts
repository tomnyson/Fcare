import { describe, expect, it } from 'vitest';
import { attendanceCareState, buildCareQuery, canViewCareStatistics } from './care-statistics';
import { parseStatisticsView } from './statistics-view';

describe('care statistics access and query', () => {
  it('allows only admins and department heads', () => {
    expect(canViewCareStatistics(['ADMIN'])).toBe(true);
    expect(canViewCareStatistics(['HEAD_OF_DEPT'])).toBe(true);
    expect(canViewCareStatistics(['LECTURER', 'TRAINING_OFFICER'])).toBe(false);
    expect(canViewCareStatistics([])).toBe(false);
  });
  it('preserves the care tab and semester in shared links', () => {
    expect(parseStatisticsView(new URLSearchParams('tab=care&term=FA26'))).toEqual({
      tab: 'care',
      term: 'FA26',
    });
  });
  it('builds identical filters for read and export endpoints', () => {
    const query = new URLSearchParams(buildCareQuery('FA26', 'teacher&1', 'uncared'));
    expect(Object.fromEntries(query)).toEqual({
      term: 'FA26',
      lecturerId: 'teacher&1',
      status: 'uncared',
    });
    expect(buildCareQuery('FA26')).toBe('?term=FA26&status=all');
  });
  it('classifies who cared for an attendance alert', () => {
    const base = { level: 2, absentSessions: 2, createdAt: '2026-09-16T00:00:00Z' };
    expect(attendanceCareState({ ...base, ownerCaredAt: '2026-09-16T01:00:00Z', careLogCount: 1 })).toBe('owner');
    expect(attendanceCareState({ ...base, ownerCaredAt: null, careLogCount: 2 })).toBe('others');
    expect(attendanceCareState({ ...base, ownerCaredAt: null, careLogCount: 0 })).toBe('pending');
  });
});

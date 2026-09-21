import { describe, expect, it } from 'vitest';
import {
  canViewDepartmentAttendance,
  defaultCareContent,
  formatNavBadge,
  groupByLevel,
  panelTone,
  splitByOwner,
} from './attendance-care';
import type { PendingAttendanceAlert } from './types';

function item(overrides: Partial<PendingAttendanceAlert>): PendingAttendanceAlert {
  return {
    id: 'a1',
    level: 2,
    status: 'OPEN',
    reason: 'Vắng 2 buổi',
    absentSessions: 2,
    ownerCaredAt: null,
    createdAt: '2026-09-16T01:00:00Z',
    careLogCount: 0,
    isOwner: true,
    student: { id: 's1', studentCode: 'SV001', fullName: 'Trần Bình', classCode: 'GD01' },
    classSection: {
      id: 'sec1',
      code: 'IT101',
      subjectName: 'Lập trình',
      lecturerName: 'Nguyễn An',
    },
    ...overrides,
  };
}

describe('groupByLevel', () => {
  it('groups by level, highest level first, keeping API order inside a group', () => {
    const groups = groupByLevel([
      item({ id: 'a', level: 2 }),
      item({ id: 'b', level: 3 }),
      item({ id: 'c', level: 2 }),
    ]);
    expect(groups.map((g) => g.level)).toEqual([3, 2]);
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('returns an empty list for no items', () => {
    expect(groupByLevel([])).toEqual([]);
  });
});

describe('panelTone', () => {
  it('maps the highest level to the semantic tone', () => {
    expect(panelTone([item({ level: 2 })])).toBe('warning');
    expect(panelTone([item({ level: 2 }), item({ level: 3 })])).toBe('orange');
    expect(panelTone([item({ level: 4 })])).toBe('danger');
    expect(panelTone([])).toBe('info');
  });
});

describe('splitByOwner', () => {
  it('separates alerts the viewer must handle from the rest', () => {
    const { owned, others } = splitByOwner([
      item({ id: 'mine' }),
      item({ id: 'theirs', isOwner: false }),
    ]);
    expect(owned.map((i) => i.id)).toEqual(['mine']);
    expect(others.map((i) => i.id)).toEqual(['theirs']);
  });
});

describe('defaultCareContent', () => {
  it('pre-fills the care log with the absence context, without PII', () => {
    expect(defaultCareContent(item({ absentSessions: 3 }))).toBe(
      'Trao đổi với sinh viên sau khi vắng 3 buổi lớp IT101 (Lập trình).',
    );
  });

  it('falls back when the absence count is unknown', () => {
    expect(defaultCareContent(item({ absentSessions: null }))).toBe(
      'Trao đổi với sinh viên về tình hình chuyên cần lớp IT101 (Lập trình).',
    );
  });
});

describe('canViewDepartmentAttendance', () => {
  it('is true for roles that see beyond their own sections', () => {
    expect(canViewDepartmentAttendance(['LECTURER'])).toBe(false);
    expect(canViewDepartmentAttendance(['HEAD_OF_DEPT'])).toBe(true);
    expect(canViewDepartmentAttendance(['SA_OFFICER'])).toBe(true);
    expect(canViewDepartmentAttendance(['LECTURER', 'ADMIN'])).toBe(true);
  });
});

describe('formatNavBadge', () => {
  it('formats counts for the sidebar pill and hides zero', () => {
    expect(formatNavBadge(0)).toBeNull();
    expect(formatNavBadge(7)).toBe('7');
    expect(formatNavBadge(120)).toBe('99+');
    expect(formatNavBadge(undefined)).toBeNull();
  });
});

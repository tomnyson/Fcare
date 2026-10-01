import { describe, expect, it } from 'vitest';
import {
  canViewDepartmentAttendance,
  defaultCareContent,
  formatNavBadge,
  openAlertsBadgeCount,
  groupByLevel,
  panelTone,
  splitByOwner,
  parseCollapsedAlertIds,
  shouldStayCollapsed,
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

describe('openAlertsBadgeCount', () => {
  it('ưu tiên số cảnh báo CHÍNH mình chưa chăm sóc', () => {
    expect(
      openAlertsBadgeCount({ myOpenAlerts: 1, openAlertsByLevel: [{ level: 2, count: 5 }] }),
    ).toBe(1);
    expect(
      openAlertsBadgeCount({ myOpenAlerts: 0, openAlertsByLevel: [{ level: 2, count: 5 }] }),
    ).toBe(0);
  });
  it('API cũ chưa có myOpenAlerts → cộng tổng theo cấp', () => {
    expect(
      openAlertsBadgeCount({
        openAlertsByLevel: [
          { level: 2, count: 2 },
          { level: 3, count: 3 },
        ],
      }),
    ).toBe(5);
    expect(openAlertsBadgeCount(undefined)).toBe(0);
  });
});

describe('shouldStayCollapsed — thu gọn khung "cần chăm sóc"', () => {
  it('chưa từng thu gọn → mở', () => {
    expect(shouldStayCollapsed(null, ['a1'])).toBe(false);
  });

  it('không có cảnh báo mới so với lúc thu gọn → giữ thu gọn', () => {
    expect(shouldStayCollapsed(['a1', 'a2'], ['a2'])).toBe(true);
  });

  it('có cảnh báo mới (SV mới hoặc nâng cấp = id mới) → tự mở lại', () => {
    expect(shouldStayCollapsed(['a1'], ['a1', 'a3'])).toBe(false);
  });
});

describe('parseCollapsedAlertIds — dữ liệu sessionStorage không tin được', () => {
  it('đọc mảng chuỗi hợp lệ', () => {
    expect(parseCollapsedAlertIds('["a1","a2"]')).toEqual(['a1', 'a2']);
  });

  it.each([null, '', 'not-json', '{"a":1}', '[1,2]'])('giá trị hỏng %p → null', (raw) => {
    expect(parseCollapsedAlertIds(raw)).toBeNull();
  });
});

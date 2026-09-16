import {
  attendanceTotals,
  formatAttendanceAlert,
  formatOwnerCared,
  latestAttendanceAlerts,
} from './attendance-care-stats';
import type { CareStudent } from './care-statistics.types';

const base = {
  studentId: 'sv-1',
  classSectionId: 'sec-a',
  absentSessions: 2,
  ownerCaredAt: null,
  careLogCount: 0,
};

const studentWith = (
  attendanceAlert: CareStudent['attendanceAlert'],
): CareStudent => ({ id: 'sv', attendanceAlert }) as unknown as CareStudent;

describe('latestAttendanceAlerts', () => {
  it('giữ bản mới nhất cho mỗi (lớp, sinh viên) và bỏ dòng không có lớp', () => {
    const map = latestAttendanceAlerts([
      { ...base, level: 2, createdAt: new Date('2026-09-10') },
      {
        ...base,
        level: 3,
        absentSessions: 3,
        createdAt: new Date('2026-09-14'),
        ownerCaredAt: new Date('2026-09-15'),
        careLogCount: 1,
      },
      { ...base, level: 2, createdAt: new Date('2026-09-12') },
      { ...base, classSectionId: null, level: 4, createdAt: new Date() },
    ]);
    expect([...map.keys()]).toEqual(['sec-a:sv-1']);
    expect(map.get('sec-a:sv-1')).toEqual({
      level: 3,
      absentSessions: 3,
      ownerCaredAt: '2026-09-15T00:00:00.000Z',
      careLogCount: 1,
      createdAt: '2026-09-14T00:00:00.000Z',
    });
  });
});

describe('attendanceTotals', () => {
  it('đếm GV đứng lớp đã chăm sóc, GV khác chăm sóc và còn chờ', () => {
    const alert = (ownerCaredAt: string | null, careLogCount: number) => ({
      level: 2,
      absentSessions: 2,
      ownerCaredAt,
      careLogCount,
      createdAt: '2026-09-10T00:00:00.000Z',
    });
    expect(
      attendanceTotals([
        studentWith(null),
        studentWith(alert('2026-09-11T00:00:00.000Z', 1)),
        studentWith(alert(null, 2)),
        studentWith(alert(null, 0)),
      ]),
    ).toEqual({ total: 3, caredByOwner: 1, caredByOthers: 1, pending: 2 });
  });

  it('không có cảnh báo → toàn 0', () => {
    expect(attendanceTotals([studentWith(null)])).toEqual({
      total: 0,
      caredByOwner: 0,
      caredByOthers: 0,
      pending: 0,
    });
  });
});

describe('định dạng cột Excel', () => {
  it('ghi mức và số buổi vắng; trạng thái GV đứng lớp', () => {
    const alert = {
      level: 3,
      absentSessions: 4,
      ownerCaredAt: null,
      careLogCount: 0,
      createdAt: '2026-09-10T00:00:00.000Z',
    };
    expect(formatAttendanceAlert(null)).toBe('Không có');
    expect(formatAttendanceAlert(alert)).toBe('Mức 3 — vắng 4 buổi');
    expect(formatAttendanceAlert({ ...alert, absentSessions: null })).toBe(
      'Mức 3',
    );
    expect(formatOwnerCared(null)).toBe('—');
    expect(formatOwnerCared(alert)).toBe('Chưa');
    expect(formatOwnerCared({ ...alert, ownerCaredAt: '2026-09-11' })).toBe(
      'GV đã chăm sóc',
    );
  });
});

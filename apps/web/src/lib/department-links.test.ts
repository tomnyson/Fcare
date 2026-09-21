import { describe, expect, it } from 'vitest';
import { parseAlertFilters } from './alert-filters';
import { departmentAlertsHref, departmentStudentsHref } from './department-links';
import { parseStudentFilters } from './student-filters';

function query(href: string): URLSearchParams {
  return new URLSearchParams(href.slice(href.indexOf('?') + 1));
}

describe('departmentStudentsHref', () => {
  it('lọc theo bộ môn và giữ khóa term rỗng để không tự điền kỳ hiện tại', () => {
    const href = departmentStudentsHref('dept-1');
    expect(href.startsWith('/students?')).toBe(true);
    const params = query(href);
    expect(params.has('term')).toBe(true);
    expect(parseStudentFilters(params)).toMatchObject({
      departmentId: 'dept-1',
      term: '',
      status: '',
    });
  });

  it('kèm trạng thái sinh viên khi bấm chip', () => {
    expect(
      parseStudentFilters(query(departmentStudentsHref('dept-1', 'DROPPED_OUT'))),
    ).toMatchObject({
      departmentId: 'dept-1',
      status: 'DROPPED_OUT',
    });
  });
});

describe('departmentAlertsHref', () => {
  it('chỉ cảnh báo chưa giải quyết của bộ môn, mọi học kỳ', () => {
    const href = departmentAlertsHref('dept-1');
    expect(href.startsWith('/alerts?')).toBe(true);
    const params = query(href);
    expect(params.has('term')).toBe(true);
    expect(parseAlertFilters(params)).toMatchObject({
      departmentId: 'dept-1',
      openOnly: true,
      term: '',
      status: '',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { classStudentsHref, dashboardSections } from './dashboard-sections';

describe('dashboardSections — Tổng quan hiển thị theo vai trò', () => {
  it('Admin và Cán bộ Đào tạo thấy bức tranh chăm sóc toàn trường', () => {
    for (const role of ['ADMIN', 'TRAINING_OFFICER']) {
      expect(dashboardSections([role])).toEqual({
        careOverview: true,
        warnedStudents: false,
        myClasses: false,
      });
    }
  });

  it('CTSV thấy danh sách sinh viên đang cảnh báo', () => {
    for (const role of ['SA_OFFICER', 'SA_HEAD']) {
      expect(dashboardSections([role])).toEqual({
        careOverview: false,
        warnedStudents: true,
        myClasses: false,
      });
    }
  });

  it('Giảng viên thấy lớp đang dạy, không thấy bức tranh toàn bộ môn', () => {
    expect(dashboardSections(['LECTURER'])).toEqual({
      careOverview: false,
      warnedStudents: false,
      myClasses: true,
    });
  });

  it('Trưởng bộ môn: chăm sóc của bộ môn mình + lớp mình dạy', () => {
    expect(dashboardSections(['HEAD_OF_DEPT'])).toEqual({
      careOverview: true,
      warnedStudents: false,
      myClasses: true,
    });
  });

  it('nhiều vai trò thì gộp các khối', () => {
    expect(dashboardSections(['LECTURER', 'SA_OFFICER'])).toEqual({
      careOverview: false,
      warnedStudents: true,
      myClasses: true,
    });
  });

  it('chưa tải được vai trò thì không hiện khối nào', () => {
    expect(dashboardSections([])).toEqual({
      careOverview: false,
      warnedStudents: false,
      myClasses: false,
    });
  });
});

describe('classStudentsHref', () => {
  it('bấm lớp → danh sách sinh viên của lớp, giữ kỳ', () => {
    expect(classStudentsHref('cs-1', 'FA26')).toBe('/students?sectionId=cs-1&term=FA26');
  });

  it('không có kỳ thì chỉ lọc theo lớp', () => {
    expect(classStudentsHref('cs 1', '')).toBe('/students?sectionId=cs+1');
  });
});

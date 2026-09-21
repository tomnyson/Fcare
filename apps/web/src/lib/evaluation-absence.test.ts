import { describe, expect, it } from 'vitest';
import {
  absenceSourceHint,
  attendanceBySection,
  initialAbsentValue,
  parseAbsentInput,
} from './evaluation-absence';

describe('attendanceBySection', () => {
  it('gom số buổi nghỉ theo lớp học phần, bỏ enrollment thiếu lớp', () => {
    expect(
      attendanceBySection([
        { absentSessions: 3, classSection: { id: 'cs-1' } },
        { absentSessions: null, classSection: { id: 'cs-2' } },
        { absentSessions: 1 },
      ]),
    ).toEqual({ 'cs-1': 3, 'cs-2': null });
  });
});

describe('initialAbsentValue', () => {
  it('bản nhận xét cũ đã ghi thì giữ nguyên số giảng viên ghi', () => {
    expect(initialAbsentValue(2, 5)).toBe('2');
  });

  it('chưa ghi thì tự điền từ dữ liệu điểm danh của hệ thống', () => {
    expect(initialAbsentValue(null, 3)).toBe('3');
    expect(initialAbsentValue(undefined, 0)).toBe('0');
  });

  it('không có cả hai thì để trống', () => {
    expect(initialAbsentValue(undefined, null)).toBe('');
    expect(initialAbsentValue(null, undefined)).toBe('');
  });
});

describe('parseAbsentInput', () => {
  it('ô trống là null, số hợp lệ thì trả số nguyên', () => {
    expect(parseAbsentInput('')).toBeNull();
    expect(parseAbsentInput('  ')).toBeNull();
    expect(parseAbsentInput('3')).toBe(3);
  });

  it('giá trị không hợp lệ không được tính điểm', () => {
    expect(parseAbsentInput('-1')).toBeNull();
    expect(parseAbsentInput('2.5')).toBeNull();
    expect(parseAbsentInput('abc')).toBeNull();
  });
});

describe('absenceSourceHint', () => {
  it('nói rõ con số lấy từ điểm danh khi giảng viên chưa sửa', () => {
    expect(absenceSourceHint(3, '3')).toContain('dữ liệu điểm danh');
  });

  it('giảng viên sửa khác hệ thống thì nhắc số gốc', () => {
    expect(absenceSourceHint(3, '1')).toContain('3 buổi');
  });

  it('hệ thống chưa có dữ liệu điểm danh', () => {
    expect(absenceSourceHint(null, '')).toContain('chưa có dữ liệu điểm danh');
  });
});

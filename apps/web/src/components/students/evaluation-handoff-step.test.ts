import { describe, expect, it } from 'vitest';
import { raiseAlertBody } from './evaluation-handoff-step';

describe('raiseAlertBody — cảnh báo phát từ nhận xét', () => {
  it('gắn lớp học phần vừa nhận xét để cột "Lớp học phần" có liên kết', () => {
    expect(
      raiseAlertBody({ studentId: 'st', level: 3, reason: 'Lý do', classSectionId: 'cs' }),
    ).toEqual({ studentId: 'st', level: 3, reason: 'Lý do', classSectionId: 'cs' });
  });

  it('không có lớp thì không gửi khoá classSectionId', () => {
    expect(raiseAlertBody({ studentId: 'st', level: 2, reason: 'Lý do' })).toEqual({
      studentId: 'st',
      level: 2,
      reason: 'Lý do',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { canSeeExcelMenu } from './nav-access';

describe('canSeeExcelMenu', () => {
  it.each(['ADMIN', 'HEAD_OF_DEPT', 'TRAINING_OFFICER'] as const)(
    'hiện mục Import / Export với %s',
    (role) => {
      expect(canSeeExcelMenu([role])).toBe(true);
    },
  );

  it.each(['SA_OFFICER', 'SA_HEAD'] as const)('ẩn mục với %s', (role) => {
    expect(canSeeExcelMenu([role])).toBe(false);
  });

  it('giảng viên vốn không có quyền Excel nên cũng không thấy', () => {
    expect(canSeeExcelMenu(['LECTURER'])).toBe(false);
  });

  it('kiêm nhiệm CTSV + Đào tạo thì vẫn thấy', () => {
    expect(canSeeExcelMenu(['SA_HEAD', 'TRAINING_OFFICER'])).toBe(true);
  });
});

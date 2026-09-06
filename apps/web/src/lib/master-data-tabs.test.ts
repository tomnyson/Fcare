import { describe, expect, it } from 'vitest';
import { canViewTrainingArea, TRAINING_AREA_ROLES } from './master-data-tabs';

describe('canViewTrainingArea', () => {
  it.each(['LECTURER', 'SA_OFFICER'] as const)('ẩn khu vực Đào tạo với %s', (role) => {
    expect(canViewTrainingArea([role])).toBe(false);
  });

  it.each(TRAINING_AREA_ROLES)('hiển thị khu vực Đào tạo với %s', (role) => {
    expect(canViewTrainingArea([role])).toBe(true);
  });

  it('cộng gộp quyền khi tài khoản có nhiều role', () => {
    expect(canViewTrainingArea(['LECTURER', 'TRAINING_OFFICER'])).toBe(true);
  });

  it('không hiển thị khi không có role', () => {
    expect(canViewTrainingArea([])).toBe(false);
  });
});

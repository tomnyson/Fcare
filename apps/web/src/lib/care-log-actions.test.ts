import { describe, expect, it } from 'vitest';
import {
  CARE_LOG_DELETE_INVALIDATION_KEYS,
  canDeleteCareLog,
  careLogDeletedMessage,
} from './care-log-actions';

describe('canDeleteCareLog — khớp CASL `delete CareLog` phía API', () => {
  it('chỉ ADMIN', () => {
    expect(canDeleteCareLog(['ADMIN'])).toBe(true);
    expect(canDeleteCareLog(['LECTURER', 'ADMIN'])).toBe(true);
    for (const role of ['LECTURER', 'HEAD_OF_DEPT', 'TRAINING_OFFICER', 'SA_OFFICER', 'SA_HEAD']) {
      expect(canDeleteCareLog([role])).toBe(false);
    }
    expect(canDeleteCareLog(undefined)).toBe(false);
  });
});

describe('sau khi xoá', () => {
  it('làm mới nhật ký, thống kê và banner cảnh báo điểm danh', () => {
    const keys = CARE_LOG_DELETE_INVALIDATION_KEYS.map(([key]) => key);
    expect(keys).toEqual(
      expect.arrayContaining(['care-logs', 'statistics', 'care-statistics', 'attendance-alerts']),
    );
  });

  it('báo rõ khi banner "cần chăm sóc" của GV đứng lớp hiện lại', () => {
    expect(careLogDeletedMessage(false)).toBe('Đã xoá lượt chăm sóc.');
    expect(careLogDeletedMessage(true)).toMatch(/hiện lại/);
  });
});

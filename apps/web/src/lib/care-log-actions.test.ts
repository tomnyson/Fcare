import { describe, expect, it } from 'vitest';
import {
  CARE_LOG_DELETE_INVALIDATION_KEYS,
  canDeleteCareLog,
  canEditCareLog,
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

describe('canEditCareLog', () => {
  it('người ghi nhật ký sửa được', () => {
    expect(canEditCareLog({ staff: { id: 'gv-1' } }, { id: 'gv-1', roles: ['LECTURER'] })).toBe(true);
  });

  it('người khác không sửa được, kể cả TBM', () => {
    expect(canEditCareLog({ staff: { id: 'gv-1' } }, { id: 'gv-2', roles: ['HEAD_OF_DEPT'] })).toBe(
      false,
    );
  });

  it('ADMIN sửa được mọi nhật ký', () => {
    expect(canEditCareLog({ staff: { id: 'gv-1' } }, { id: 'ad', roles: ['ADMIN'] })).toBe(true);
  });

  it('chưa tải xong người dùng → ẩn nút', () => {
    expect(canEditCareLog({ staff: { id: 'gv-1' } }, undefined)).toBe(false);
  });
});

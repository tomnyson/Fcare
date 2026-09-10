import { describe, expect, it } from 'vitest';
import {
  canViewTrainingArea,
  isMasterDataTabKey,
  MASTER_DATA_TABS,
  TRAINING_AREA_ROLES,
} from './master-data-tabs';

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

describe('MASTER_DATA_TABS', () => {
  it('có đủ ba tab ánh xạ, mỗi tab một endpoint riêng', () => {
    const byKey = Object.fromEntries(MASTER_DATA_TABS.map((tab) => [tab.key, tab]));
    expect(byKey['department-aliases'].path).toBe('/department-aliases');
    expect(byKey['major-aliases'].path).toBe('/major-aliases');
    expect(byKey['class-major-rules'].path).toBe('/class-major-rules');
  });

  it('nhãn tab ánh xạ ngành không lẫn với ánh xạ bộ môn', () => {
    const labels = MASTER_DATA_TABS.map((tab) => tab.label);
    expect(labels).toContain('Ánh xạ bộ môn');
    expect(labels).toContain('Ánh xạ ngành');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('key và path không trùng nhau', () => {
    const keys = MASTER_DATA_TABS.map((tab) => tab.key);
    const paths = MASTER_DATA_TABS.map((tab) => tab.path);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('isMasterDataTabKey', () => {
  it('nhận mọi key trong bảng, từ chối key lạ', () => {
    for (const tab of MASTER_DATA_TABS) {
      expect(isMasterDataTabKey(tab.key)).toBe(true);
    }
    expect(isMasterDataTabKey('major-alias')).toBe(false);
    expect(isMasterDataTabKey('')).toBe(false);
  });
});

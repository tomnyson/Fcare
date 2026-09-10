import { describe, expect, it } from 'vitest';
import {
  MAPPING_TARGETS,
  mappingCodeKey,
  NEW_TARGET_VALUE,
  remainingUnmapped,
  shouldCreateAlias,
} from './mapping-targets';

describe('MAPPING_TARGETS', () => {
  it('hai loại trỏ tới endpoint và trường ID riêng, không lẫn nhau', () => {
    expect(MAPPING_TARGETS.department.aliasPath).toBe('/department-aliases');
    expect(MAPPING_TARGETS.department.targetField).toBe('departmentId');
    expect(MAPPING_TARGETS.major.aliasPath).toBe('/major-aliases');
    expect(MAPPING_TARGETS.major.targetField).toBe('majorId');
  });

  it('nói đúng hậu quả của từng loại — bộ môn mất dòng, ngành chỉ trống ngành', () => {
    expect(MAPPING_TARGETS.department.consequence).toContain('bỏ qua');
    expect(MAPPING_TARGETS.major.consequence).toContain('vẫn được tạo');
    expect(MAPPING_TARGETS.major.consequence).not.toContain('bỏ qua');
  });
});

describe('remainingUnmapped', () => {
  it('bỏ mã vừa gán nhanh khỏi danh sách cảnh báo', () => {
    const mapped = new Set([mappingCodeKey('major', 'CHNA')]);
    expect(remainingUnmapped('major', ['CHNA', 'CE'], mapped)).toEqual(['CE']);
  });

  it('mã trùng chuỗi nhưng khác loại KHÔNG bị trừ nhầm', () => {
    const mapped = new Set([mappingCodeKey('department', 'CNTT')]);
    expect(remainingUnmapped('major', ['CNTT'], mapped)).toEqual(['CNTT']);
    expect(remainingUnmapped('department', ['CNTT'], mapped)).toEqual([]);
  });

  it('không gán gì thì giữ nguyên, và trả mảng mới', () => {
    const codes = ['CHNA', 'CE'];
    const result = remainingUnmapped('major', codes, new Set());
    expect(result).toEqual(codes);
    expect(result).not.toBe(codes);
  });
});

describe('shouldCreateAlias', () => {
  it('bỏ ánh xạ khi mã danh mục mới trùng mã trong file — committer đã tra mã thật', () => {
    expect(shouldCreateAlias('LTAI', 'LTAI')).toBe(false);
    expect(shouldCreateAlias(' ltai ', 'LTAI')).toBe(false);
  });

  it('vẫn tạo ánh xạ khi mã danh mục khác mã trong file', () => {
    expect(shouldCreateAlias('LTAI', 'CHNA')).toBe(true);
  });
});

describe('tuỳ chọn tạo mới', () => {
  it('sentinel không phải id thật nên không đụng dữ liệu', () => {
    expect(NEW_TARGET_VALUE.startsWith('__')).toBe(true);
  });

  it('chỉ ngành cần chọn bộ môn chủ quản khi tạo mới', () => {
    expect(MAPPING_TARGETS.major.createNeedsDepartment).toBe(true);
    expect(MAPPING_TARGETS.department.createNeedsDepartment).toBe(false);
  });
});

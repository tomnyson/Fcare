import { describe, expect, it } from 'vitest';
import {
  isTermValid,
  resolveInitialTerm,
} from './import-term-helpers';

describe('resolveInitialTerm', () => {
  it('ưu tiên trả về mã học kỳ active hiện tại', () => {
    expect(resolveInitialTerm('SU25', [{ code: 'SP25' }, { code: 'SU25' }])).toBe('SU25');
  });

  it('fallback về kỳ đầu tiên trong danh mục nếu không có kỳ active', () => {
    expect(resolveInitialTerm(null, [{ code: 'FA25' }, { code: 'SP26' }])).toBe('FA25');
  });

  it('fallback về SU25 nếu cả kỳ active lẫn danh mục đều rỗng', () => {
    expect(resolveInitialTerm(null, [])).toBe('SU25');
    expect(resolveInitialTerm(undefined, undefined)).toBe('SU25');
  });
});

describe('isTermValid', () => {
  it('hợp lệ khi gồm 2 chữ cái in hoa và 2 chữ số', () => {
    expect(isTermValid('SU25')).toBe(true);
    expect(isTermValid('SP26')).toBe(true);
    expect(isTermValid('FA24')).toBe(true);
  });

  it('không hợp lệ với chuỗi rỗng, chữ thường, hoặc sai định dạng', () => {
    expect(isTermValid('')).toBe(false);
    expect(isTermValid('su25')).toBe(false);
    expect(isTermValid('SU2025')).toBe(false);
    expect(isTermValid('SUMMER25')).toBe(false);
    expect(isTermValid('25SU')).toBe(false);
  });
});

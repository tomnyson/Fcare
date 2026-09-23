import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('restore-gate', () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  describe('resolveRestoreGate', () => {
    it('dùng PIN khi NEXT_PUBLIC_SYSTEM_PIN là 6 chữ số', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { resolveRestoreGate } = await import('./restore-gate');
      expect(resolveRestoreGate()).toEqual({ kind: 'pin', length: 6 });
    });

    it('rơi về từ khóa XAC NHAN khi PIN chưa cấu hình', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '');
      const { resolveRestoreGate, RESTORE_CONFIRMATION_KEYWORD } = await import('./restore-gate');
      expect(resolveRestoreGate()).toEqual({
        kind: 'keyword',
        keyword: RESTORE_CONFIRMATION_KEYWORD,
      });
      expect(RESTORE_CONFIRMATION_KEYWORD).toBe('XAC NHAN');
    });
  });

  describe('checkRestoreGate — PIN', () => {
    it('chấp nhận đúng PIN', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { checkRestoreGate } = await import('./restore-gate');
      expect(checkRestoreGate({ kind: 'pin', length: 6 }, '654321')).toEqual({ ok: true });
    });

    it('từ chối PIN chưa đủ số mà không tính là sai', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { checkRestoreGate } = await import('./restore-gate');
      const result = checkRestoreGate({ kind: 'pin', length: 6 }, '6543');
      expect(result).toEqual({ ok: false, reason: 'incomplete', message: expect.any(String) });
    });

    it('từ chối PIN sai và báo là sai', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { checkRestoreGate } = await import('./restore-gate');
      const result = checkRestoreGate({ kind: 'pin', length: 6 }, '000000');
      expect(result).toEqual({ ok: false, reason: 'wrong', message: expect.any(String) });
    });
  });

  describe('checkRestoreGate — từ khóa', () => {
    it('chấp nhận từ khóa không phân biệt hoa thường và khoảng trắng thừa', async () => {
      const { checkRestoreGate } = await import('./restore-gate');
      const gate = { kind: 'keyword', keyword: 'XAC NHAN' } as const;
      expect(checkRestoreGate(gate, '  xac nhan ')).toEqual({ ok: true });
    });

    it('từ chối từ khóa sai', async () => {
      const { checkRestoreGate } = await import('./restore-gate');
      const gate = { kind: 'keyword', keyword: 'XAC NHAN' } as const;
      expect(checkRestoreGate(gate, 'XAC')).toMatchObject({ ok: false, reason: 'wrong' });
    });
  });

  describe('remainingAttempts', () => {
    it('đếm ngược từ giới hạn và không âm', async () => {
      const { remainingRestoreAttempts, MAX_RESTORE_ATTEMPTS } = await import('./restore-gate');
      expect(remainingRestoreAttempts(0)).toBe(MAX_RESTORE_ATTEMPTS);
      expect(remainingRestoreAttempts(MAX_RESTORE_ATTEMPTS + 3)).toBe(0);
    });
  });
});

import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

describe('system-pin utilities', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('isSystemPinEnabled', () => {
    it('trả về false khi không có env var', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '');
      const { isSystemPinEnabled } = await import('./system-pin');
      expect(isSystemPinEnabled()).toBe(false);
    });

    it('trả về true khi env var là 6 chữ số', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '123456');
      const { isSystemPinEnabled } = await import('./system-pin');
      expect(isSystemPinEnabled()).toBe(true);
    });

    it('trả về false khi env var không đúng 6 chữ số', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '12345');
      const { isSystemPinEnabled } = await import('./system-pin');
      expect(isSystemPinEnabled()).toBe(false);
    });
  });

  describe('verifySystemPin', () => {
    it('trả về true khi input khớp với env var', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { verifySystemPin } = await import('./system-pin');
      expect(verifySystemPin('654321')).toBe(true);
    });

    it('trả về false khi input không khớp', async () => {
      vi.stubEnv('NEXT_PUBLIC_SYSTEM_PIN', '654321');
      const { verifySystemPin } = await import('./system-pin');
      expect(verifySystemPin('000000')).toBe(false);
    });
  });
});


import { describe, expect, it } from 'vitest';
import {
  SOUND_PREFERENCE_KEY,
  readSoundPreference,
  shouldPlayAlertSound,
  writeSoundPreference,
  type PreferenceStorage,
} from './alert-sound';

function memoryStorage(initial: Record<string, string> = {}): PreferenceStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStorage: PreferenceStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('shouldPlayAlertSound', () => {
  it.each([
    [1, false],
    [2, false],
    [3, true],
    [4, true],
  ])('cấp %i → %s', (alertLevel, expected) => {
    expect(shouldPlayAlertSound({ alertLevel }, true)).toBe(expected);
  });

  it('không gắn cảnh báo thì im', () => {
    expect(shouldPlayAlertSound({ alertLevel: null }, true)).toBe(false);
    expect(shouldPlayAlertSound({}, true)).toBe(false);
  });

  it('người dùng tắt âm thì im kể cả cấp 4', () => {
    expect(shouldPlayAlertSound({ alertLevel: 4 }, false)).toBe(false);
  });
});

describe('tuỳ chọn âm thanh', () => {
  it('mặc định bật', () => {
    expect(readSoundPreference(memoryStorage())).toBe(true);
    expect(readSoundPreference(null)).toBe(true);
  });

  it('ghi tắt rồi đọc lại', () => {
    const storage = memoryStorage();
    writeSoundPreference(false, storage);
    expect(storage.data[SOUND_PREFERENCE_KEY]).toBe('off');
    expect(readSoundPreference(storage)).toBe(false);
    writeSoundPreference(true, storage);
    expect(readSoundPreference(storage)).toBe(true);
  });

  it('localStorage ném lỗi thì vẫn chạy, coi như bật', () => {
    expect(readSoundPreference(throwingStorage)).toBe(true);
    expect(() => writeSoundPreference(false, throwingStorage)).not.toThrow();
  });
});

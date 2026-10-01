import {
  DEFAULT_IDLE_LOCK_MINUTES,
  IDLE_LOCK_MINUTES_OPTIONS,
  isIdleLockMinutes,
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  validatePinFormat,
} from '@fcare/shared-types';

describe('validatePinFormat — PIN 6 số', () => {
  it('nhận PIN 6 chữ số không theo quy luật', () => {
    expect(validatePinFormat('246813')).toBeNull();
    expect(validatePinFormat('907315')).toBeNull();
  });

  it.each(['', '12345', '1234567', '12a456', ' 24681', '２４６８１３'])(
    'từ chối "%s" không đúng 6 chữ số',
    (pin) => {
      expect(validatePinFormat(pin)).toMatch(/6 chữ số/);
    },
  );

  it.each(['000000', '111111', '999999'])(
    'từ chối PIN lặp một số %s',
    (pin) => {
      expect(validatePinFormat(pin)).toMatch(/quá dễ đoán/);
    },
  );

  it.each(['123456', '234567', '654321', '987654', '012345'])(
    'từ chối dãy liên tiếp %s',
    (pin) => {
      expect(validatePinFormat(pin)).toMatch(/quá dễ đoán/);
    },
  );
});

describe('thời gian khoá ứng dụng', () => {
  it('chỉ cho các mốc 3, 5, 10, 15, 30, 60 phút', () => {
    expect(IDLE_LOCK_MINUTES_OPTIONS).toEqual([3, 5, 10, 15, 30, 60]);
    expect(isIdleLockMinutes(15)).toBe(true);
    expect(isIdleLockMinutes(7)).toBe(false);
    expect(isIdleLockMinutes('15')).toBe(false);
  });

  it('mặc định 15 phút, PIN 6 số, sai tối đa 5 lần', () => {
    expect(DEFAULT_IDLE_LOCK_MINUTES).toBe(15);
    expect(PIN_LENGTH).toBe(6);
    expect(MAX_PIN_ATTEMPTS).toBe(5);
  });
});

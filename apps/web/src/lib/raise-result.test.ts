import { describe, expect, it } from 'vitest';
import { describeRaiseResult, minRaiseLevel } from './raise-result';

const base = { level: 3, requestedLevel: 3, systemLevel: 1, previousLevel: null, notifiedCount: 4 };

describe('describeRaiseResult — báo đúng việc hệ thống đã làm với cảnh báo', () => {
  it('tạo mới đúng mức đã chọn', () => {
    expect(describeRaiseResult({ ...base, decision: 'created' })).toEqual({
      tone: 'success',
      text: 'Đã phát cảnh báo Mức 3, thông báo tới 4 người.',
    });
  });

  it('tạo mới nhưng hệ thống tự nâng mức', () => {
    const result = describeRaiseResult({
      ...base,
      decision: 'created',
      requestedLevel: 1,
      systemLevel: 3,
    });
    expect(result.tone).toBe('warning');
    expect(result.text).toBe(
      'Đã phát cảnh báo Mức 3 — hệ thống tự nâng từ Mức 1 theo điểm rủi ro học kỳ. Thông báo tới 4 người.',
    );
  });

  it('nâng mức cảnh báo đang mở thay vì tạo mới', () => {
    expect(
      describeRaiseResult({ ...base, decision: 'escalated', previousLevel: 2, level: 4 }).text,
    ).toBe('Sinh viên đã có cảnh báo đang mở — đã nâng từ Mức 2 lên Mức 4 và báo lại 4 người.');
  });

  it('gộp lý do vào cảnh báo đang mở, không báo ai', () => {
    expect(describeRaiseResult({ ...base, decision: 'merged', notifiedCount: 0 })).toEqual({
      tone: 'info',
      text: 'Sinh viên đã có cảnh báo Mức 3 đang mở — đã bổ sung lý do vào cảnh báo đó, không gửi thông báo mới.',
    });
  });

  it('API cũ không trả decision → coi như tạo mới', () => {
    expect(describeRaiseResult({ level: 2 }).text).toBe('Đã phát cảnh báo Mức 2.');
  });
});

describe('minRaiseLevel — không cho chọn thấp hơn mức hệ thống', () => {
  it('lấy max(DRS, mức ép từ dữ liệu), chưa có điểm thì 1', () => {
    expect(minRaiseLevel({ drsLevel: 2, dataForcedLevel: 3 })).toBe(3);
    expect(minRaiseLevel({ drsLevel: 4, dataForcedLevel: 1 })).toBe(4);
    expect(minRaiseLevel(undefined)).toBe(1);
  });
});

import { countAlertsAwaitingMyCare } from './my-alert-care';

const at = (iso: string) => new Date(iso);
const alertA = {
  id: 'a1',
  studentId: 'sv-1',
  createdAt: at('2026-09-10T08:00:00Z'),
};
const alertB = {
  id: 'a2',
  studentId: 'sv-2',
  createdAt: at('2026-09-12T08:00:00Z'),
};

describe('countAlertsAwaitingMyCare — badge "Cảnh báo" riêng từng giảng viên', () => {
  it('chưa ghi nhật ký nào → đếm đủ cảnh báo đang mở', () => {
    expect(countAlertsAwaitingMyCare([alertA, alertB], [])).toBe(2);
  });

  it('ghi nhật ký về SV sau khi cảnh báo phát → bớt 1', () => {
    const logs = [
      {
        studentId: 'sv-1',
        alertId: null,
        createdAt: at('2026-09-11T00:00:00Z'),
      },
    ];
    expect(countAlertsAwaitingMyCare([alertA, alertB], logs)).toBe(1);
  });

  it('nhật ký cũ hơn cảnh báo không tính là đã chăm sóc cảnh báo mới', () => {
    const logs = [
      {
        studentId: 'sv-1',
        alertId: null,
        createdAt: at('2026-09-09T00:00:00Z'),
      },
    ];
    expect(countAlertsAwaitingMyCare([alertA], logs)).toBe(1);
  });

  it('nhật ký gắn đúng alertId luôn tính, kể cả khi thời gian lệch', () => {
    const logs = [
      {
        studentId: 'sv-1',
        alertId: 'a1',
        createdAt: at('2026-09-01T00:00:00Z'),
      },
    ];
    expect(countAlertsAwaitingMyCare([alertA], logs)).toBe(0);
  });

  it('nhật ký về SV khác không ảnh hưởng', () => {
    const logs = [
      {
        studentId: 'sv-9',
        alertId: null,
        createdAt: at('2026-09-20T00:00:00Z'),
      },
    ];
    expect(countAlertsAwaitingMyCare([alertA, alertB], logs)).toBe(2);
  });
});

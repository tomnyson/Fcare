import { decideRaise, mergedReason, systemRaiseNote } from './raise-decision';

describe('decideRaise — gộp cảnh báo đang mở, không hạ dưới mức hệ thống', () => {
  it('chưa có cảnh báo mở: tạo mới đúng mức giảng viên chọn khi không thấp hơn hệ thống', () => {
    expect(
      decideRaise({ requestedLevel: 3, systemLevel: 2, open: null }),
    ).toEqual({ type: 'create', level: 3, raisedBySystem: false });
  });

  it('giảng viên chọn thấp hơn hệ thống: tự nâng lên mức hệ thống', () => {
    expect(
      decideRaise({ requestedLevel: 1, systemLevel: 3, open: null }),
    ).toEqual({ type: 'create', level: 3, raisedBySystem: true });
  });

  it('đang có cảnh báo mở thấp hơn: nâng mức cảnh báo đó, không tạo mới', () => {
    expect(
      decideRaise({
        requestedLevel: 2,
        systemLevel: 4,
        open: { id: 'al', level: 2 },
      }),
    ).toEqual({
      type: 'escalate',
      alertId: 'al',
      fromLevel: 2,
      level: 4,
      raisedBySystem: true,
    });
  });

  it('mức mới bằng mức đang mở: chỉ gộp lý do, không báo lại', () => {
    expect(
      decideRaise({
        requestedLevel: 3,
        systemLevel: 1,
        open: { id: 'al', level: 3 },
      }),
    ).toEqual({ type: 'merge', alertId: 'al', level: 3 });
  });

  it('mức mới thấp hơn mức đang mở: không bao giờ hạ, chỉ gộp lý do', () => {
    expect(
      decideRaise({
        requestedLevel: 1,
        systemLevel: 2,
        open: { id: 'al', level: 4 },
      }),
    ).toEqual({ type: 'merge', alertId: 'al', level: 4 });
  });

  it('mức hệ thống ngoài khoảng 1..4 bị kẹp lại', () => {
    expect(
      decideRaise({ requestedLevel: 2, systemLevel: 9, open: null }),
    ).toMatchObject({ level: 4 });
    expect(
      decideRaise({ requestedLevel: 2, systemLevel: 0, open: null }),
    ).toMatchObject({ level: 2 });
  });
});

describe('ghi chú lý do', () => {
  it('ghi rõ hệ thống đã nâng từ mức nào lên mức nào', () => {
    expect(systemRaiseNote(1, 3)).toBe(
      'Hệ thống tự nâng từ mức 1 lên mức 3 theo điểm rủi ro của học kỳ.',
    );
  });

  it('gộp lý do mới vào cuối lý do cũ, kèm ngày', () => {
    const at = new Date('2026-09-26T03:00:00Z');
    expect(mergedReason('Vắng nhiều.', 'Không nộp bài.', at)).toBe(
      'Vắng nhiều.\n\n[Cập nhật 26/09/2026] Không nộp bài.',
    );
  });

  it('lý do mới trùng hệt lý do đã có thì không nối lặp', () => {
    const at = new Date('2026-09-26T03:00:00Z');
    expect(mergedReason('Vắng nhiều.', ' Vắng nhiều. ', at)).toBe(
      'Vắng nhiều.',
    );
  });
});

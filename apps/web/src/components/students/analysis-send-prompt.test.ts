import { describe, expect, it } from 'vitest';
import { LECTURER_NOTE_MIN, sendBlockedReason } from './analysis-send-prompt';

describe('sendBlockedReason', () => {
  it('cho gửi bản AI khi đã có tóm tắt', () => {
    expect(sendBlockedReason('AI', 'AI da tong hop noi dung.', '')).toBeNull();
  });

  it('chặn bản AI rỗng và gợi ý tự soạn', () => {
    expect(sendBlockedReason('AI', '   ', '')).toBe(
      'Bản AI chưa có nội dung tóm tắt để gửi — hãy chọn tự soạn nội dung.',
    );
  });

  it('bản tự soạn phải đủ dài và báo còn thiếu bao nhiêu ký tự', () => {
    const note = 'Ngắn quá';
    expect(sendBlockedReason('LECTURER', 'AI co noi dung', note)).toBe(
      `Nội dung bạn tự soạn cần từ ${LECTURER_NOTE_MIN} ký tự (còn thiếu ${
        LECTURER_NOTE_MIN - note.length
      }).`,
    );
  });

  it('cho gửi bản tự soạn khi đủ 40 ký tự', () => {
    expect(sendBlockedReason('LECTURER', '', 'a'.repeat(LECTURER_NOTE_MIN))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  IDLE_PROGRESS,
  clearIfDone,
  failProgress,
  finishProgress,
  progressView,
  startProgress,
  tickProgress,
  withUploadRatio,
} from './import-progress';

const T0 = 1_000_000;

describe('startProgress', () => {
  it('upload bắt đầu ở pha gửi file, 0%', () => {
    const state = startProgress('upload', 'roster', T0);
    expect(state).toMatchObject({ operation: 'upload', phase: 'uploading', percent: 0, uploadRatio: null });
  });

  it('commit bắt đầu ở 5%', () => {
    expect(progressView(startProgress('commit', 'roster', T0)).percent).toBe(5);
  });

  it('loại kế tiếp trong chuỗi luôn bắt đầu lại từ 0 dù loại trước đã 100%', () => {
    const finished = finishProgress(startProgress('commit', 'roster', T0));
    expect(finished.percent).toBe(100);
    const next = startProgress('upload', 'grade-attendance', T0 + 10);
    expect(next.percent).toBe(0);
  });
});

describe('withUploadRatio — đoạn gửi file là % thật', () => {
  it('50% byte đã gửi → 15%', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 0.5, T0 + 100);
    expect(state.percent).toBe(15);
    expect(state.phase).toBe('uploading');
  });

  it('gửi xong (ratio 1) → sang pha máy chủ xử lý ở 30%, đánh dấu bước "Gửi file"', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0 + 100);
    expect(state).toMatchObject({ phase: 'parsing', percent: 30, phaseStartedAt: T0 + 100 });
    expect(progressView(state).steps[0]).toEqual({ label: 'Gửi file', done: true });
    expect(progressView(state).steps.slice(1).every((step) => !step.done)).toBe(true);
  });

  it('gửi lại sau 401 (ratio nhỏ khi đã ở pha máy chủ) → bỏ qua, % không tụt', () => {
    const parsing = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0);
    const again = withUploadRatio(parsing, 0.1, T0 + 50);
    expect(again).toBe(parsing);
  });

  it('ratio ngoài 0..1 được kẹp lại', () => {
    const state = withUploadRatio(startProgress('upload', 'roster', T0), 1.7, T0);
    expect(state.percent).toBe(30);
  });

  it('không đo được byte (null) → ước lượng theo thời gian, luôn < 30', () => {
    const unknown = withUploadRatio(startProgress('upload', 'roster', T0), null, T0);
    const later = tickProgress(unknown, T0 + 3_000);
    expect(later.percent).toBeGreaterThan(0);
    expect(tickProgress(unknown, T0 + 10_000_000).percent).toBe(29);
  });
});

describe('tickProgress — đoạn máy chủ là ước lượng tiệm cận', () => {
  it('pha máy chủ đọc file: 30 → tiến dần, không bao giờ chạm 90', () => {
    const parsing = withUploadRatio(startProgress('upload', 'roster', T0), 1, T0);
    const afterTau = tickProgress(parsing, T0 + 8_000);
    expect(afterTau.percent).toBe(67); // 30 + 60 * (1 - e^-1) = 67.9 → 67
    expect(tickProgress(parsing, T0 + 10_000_000).percent).toBe(89);
  });

  it('commit rất lâu (vượt 2 phút) vẫn ≤ 89, không bao giờ 100 trước phản hồi', () => {
    const committing = startProgress('commit', 'roster', T0);
    expect(tickProgress(committing, T0 + 180_000).percent).toBe(89);
    expect(tickProgress(committing, T0 + Number.MAX_SAFE_INTEGER / 2).percent).toBe(89);
  });

  it('file điểm danh commit chậm hơn loại khác (tau 40s vs 20s)', () => {
    const roster = tickProgress(startProgress('commit', 'roster', T0), T0 + 20_000);
    const attendance = tickProgress(startProgress('commit', 'grade-attendance', T0), T0 + 20_000);
    expect(roster.percent).toBe(58); // 5 + 85 * (1 - e^-1) = 58.7 → 58
    expect(attendance.percent).toBeLessThan(roster.percent);
  });

  it('không bao giờ lùi', () => {
    const committing = { ...startProgress('commit', 'roster', T0), percent: 70 };
    expect(tickProgress(committing, T0 + 1).percent).toBe(70);
  });

  it('pha đã xong / lỗi / idle không đổi khi tick', () => {
    const done = finishProgress(startProgress('commit', 'roster', T0));
    expect(tickProgress(done, T0 + 99_999)).toBe(done);
    expect(tickProgress(IDLE_PROGRESS, T0)).toBe(IDLE_PROGRESS);
  });
});

describe('finishProgress / failProgress', () => {
  it('xong → 100%, mọi bước đã xong, tông done', () => {
    const view = progressView(finishProgress(startProgress('upload', 'roster', T0)));
    expect(view.percent).toBe(100);
    expect(view.tone).toBe('done');
    expect(view.steps.every((step) => step.done)).toBe(true);
  });

  it('lỗi → giữ % cuối, tông error', () => {
    const running = tickProgress(startProgress('commit', 'roster', T0), T0 + 20_000);
    const failed = failProgress(running);
    expect(failed.percent).toBe(running.percent);
    expect(progressView(failed)).toMatchObject({ tone: 'error', label: 'Xử lý thất bại' });
  });

  it('clearIfDone: done → idle; loại kế tiếp đã bắt đầu thì không bị ẩn nhầm', () => {
    const done = finishProgress(startProgress('commit', 'roster', T0));
    expect(clearIfDone(done)).toBe(IDLE_PROGRESS);
    const next = startProgress('upload', 'grade-attendance', T0 + 10);
    expect(clearIfDone(next)).toBe(next);
    const failed = failProgress(next);
    expect(clearIfDone(failed)).toBe(failed);
  });

  it('không mutate state đầu vào', () => {
    const state = Object.freeze(startProgress('upload', 'roster', T0));
    expect(() => failProgress(finishProgress(withUploadRatio(state, 1, T0)))).not.toThrow();
  });
});

describe('progressView — danh sách bước & nhãn', () => {
  it('upload có 5 bước theo thứ tự', () => {
    const labels = progressView(startProgress('upload', 'roster', T0)).steps.map((s) => s.label);
    expect(labels).toEqual([
      'Gửi file',
      'Đọc file',
      'Lọc dữ liệu cá nhân',
      'Kiểm tra dữ liệu & ánh xạ',
      'Lưu bản xem trước',
    ]);
  });

  it('commit file điểm danh có thêm bước rà soát cảnh báo vắng', () => {
    const labels = progressView(startProgress('commit', 'grade-attendance', T0)).steps.map((s) => s.label);
    expect(labels).toEqual(['Ghi dữ liệu vào hệ thống', 'Rà soát cảnh báo vắng']);
  });

  it('commit loại khác chỉ có bước ghi dữ liệu', () => {
    const labels = progressView(startProgress('commit', 'roster', T0)).steps.map((s) => s.label);
    expect(labels).toEqual(['Ghi dữ liệu vào hệ thống']);
  });

  it('valueText cho trình đọc màn hình ghép nhãn + %', () => {
    const view = progressView(withUploadRatio(startProgress('upload', 'roster', T0), 1, T0));
    expect(view.valueText).toBe('Máy chủ đang đọc và kiểm tra file — 30%');
  });

  it('idle không có bước, tông idle', () => {
    expect(progressView(IDLE_PROGRESS)).toMatchObject({ tone: 'idle', percent: 0, steps: [] });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../lib/api';
import { buildAlertReason, raiseAlertBody, raiseEvaluationAlert } from './evaluation-handoff-step';

describe('raiseAlertBody — cảnh báo phát từ nhận xét', () => {
  it('gắn lớp học phần vừa nhận xét để cột "Lớp học phần" có liên kết', () => {
    expect(
      raiseAlertBody({ studentId: 'st', level: 3, reason: 'Lý do', classSectionId: 'cs' }),
    ).toEqual({ studentId: 'st', level: 3, reason: 'Lý do', classSectionId: 'cs' });
  });

  it('không có lớp thì không gửi khoá classSectionId', () => {
    expect(raiseAlertBody({ studentId: 'st', level: 2, reason: 'Lý do' })).toEqual({
      studentId: 'st',
      level: 2,
      reason: 'Lý do',
    });
  });
});

describe('buildAlertReason — lý do cảnh báo tự sinh từ nhận xét', () => {
  const base = {
    term: 'FA26',
    criterionLabels: ['Vắng nhiều', 'Không nộp bài'],
    note: '  Hay ngủ gật ',
    suggestedLevel: 3,
    academicDescription: 'Yếu',
    attitudeDescription: 'Kém',
  };

  it('ghép học kỳ, tiêu chí và ghi chú GV', () => {
    expect(buildAlertReason(base)).toBe(
      'Nhận xét DRS học kỳ FA26: Tiêu chí ghi nhận: Vắng nhiều, Không nộp bài. Ghi chú GV: Hay ngủ gật.',
    );
  });

  it('mức 4 thiếu độ dài thì bổ sung mô tả học tập/thái độ để đạt ≥ 40 ký tự', () => {
    const reason = buildAlertReason({ ...base, criterionLabels: [], note: '', suggestedLevel: 4 });
    expect(reason.length).toBeGreaterThanOrEqual(40);
    expect(reason).toContain('Khả năng học tập: Yếu. Thái độ: Kém.');
  });
});

describe('raiseEvaluationAlert — trả kết quả gộp cảnh báo cho người phát', () => {
  afterEach(() => vi.mocked(apiFetch).mockReset());

  it('trả về kết quả POST /alerts (tạo mới / nâng mức / gộp lý do)', async () => {
    const result = { id: 'al', level: 3, decision: 'escalated', previousLevel: 2 };
    vi.mocked(apiFetch).mockResolvedValueOnce(result).mockResolvedValueOnce({});
    await expect(
      raiseEvaluationAlert({ studentId: 'st', term: 'FA26', level: 2, reason: 'Lý do' }),
    ).resolves.toEqual(result);
  });

  it('AI chưa bật vẫn trả kết quả cảnh báo, không ném lỗi', async () => {
    const result = { id: 'al', level: 2, decision: 'merged' };
    vi.mocked(apiFetch).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('AI tắt'));
    await expect(
      raiseEvaluationAlert({ studentId: 'st', term: 'FA26', level: 2, reason: 'Lý do' }),
    ).resolves.toEqual(result);
  });
});

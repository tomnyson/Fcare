import { careHistoryDigest } from './care-history-digest';
import type { AnalysisSourceCareLog } from './analysis-source';

function log(
  overrides: Partial<AnalysisSourceCareLog> = {},
): AnalysisSourceCareLog {
  return {
    channel: 'IN_PERSON',
    content: 'Gặp sinh viên trao đổi về việc nghỉ học',
    outcome: null,
    nextAction: null,
    createdAt: '2026-09-01T02:00:00.000Z',
    ...overrides,
  };
}

describe('careHistoryDigest', () => {
  it('chưa chăm sóc lần nào thì trả chuỗi rỗng', () => {
    expect(careHistoryDigest([])).toBe('');
  });

  it('ghi ngày, kênh và nội dung trên một dòng', () => {
    const digest = careHistoryDigest([log()]);
    expect(digest).toBe(
      '01/09/2026 · Gặp trực tiếp · Gặp sinh viên trao đổi về việc nghỉ học',
    );
  });

  it('có kết quả thì ghi kèm trong ngoặc', () => {
    const digest = careHistoryDigest([
      log({ outcome: 'Sinh viên hứa đi học lại' }),
    ]);
    expect(digest).toContain('(kết quả: Sinh viên hứa đi học lại)');
  });

  it('sắp xếp mới nhất lên trước và chỉ giữ 5 lượt gần nhất', () => {
    const logs = Array.from({ length: 8 }, (_, index) =>
      log({
        content: `Lần ${index + 1}`,
        createdAt: `2026-0${index + 1}-01T02:00:00.000Z`,
      }),
    );
    const lines = careHistoryDigest(logs).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain('Lần 8');
    expect(lines[4]).toContain('Lần 4');
  });

  it('cắt nội dung quá dài để thông báo không phình ra', () => {
    const digest = careHistoryDigest([log({ content: 'a'.repeat(400) })]);
    expect(digest.length).toBeLessThan(260);
    expect(digest).toContain('…');
  });

  it('không vượt trần tổng độ dài dù có 5 lượt đều dài', () => {
    const logs = Array.from({ length: 5 }, (_, index) =>
      log({
        content: 'b'.repeat(300),
        outcome: 'c'.repeat(300),
        createdAt: `2026-0${index + 1}-01T02:00:00.000Z`,
      }),
    );
    expect(careHistoryDigest(logs).length).toBeLessThanOrEqual(1_200);
  });
});

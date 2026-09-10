import { describe, expect, it } from 'vitest';
import { careHistoryEntries } from './analysis-care-history';

const log = (createdAt: string, content: string) => ({
  createdAt,
  channel: 'IN_PERSON',
  content,
  outcome: '',
  nextAction: '',
});

describe('careHistoryEntries', () => {
  it('trả mảng rỗng khi snapshot không có lịch sử chăm sóc', () => {
    expect(careHistoryEntries(null)).toEqual([]);
    expect(careHistoryEntries({})).toEqual([]);
    expect(careHistoryEntries({ careLogs: 'sai kiểu' })).toEqual([]);
  });

  it('lấy tối đa 5 lượt mới nhất, sắp xếp giảm dần', () => {
    const careLogs = Array.from({ length: 7 }, (_, index) =>
      log(`2026-09-0${index + 1}T00:00:00.000Z`, `lan ${index + 1}`),
    );
    const entries = careHistoryEntries({ careLogs });
    expect(entries).toHaveLength(5);
    expect(entries[0].content).toBe('lan 7');
    expect(entries[4].content).toBe('lan 3');
  });

  it('bỏ dòng hỏng và chuyển kết quả rỗng thành null', () => {
    const entries = careHistoryEntries({
      careLogs: [log('2026-09-01T00:00:00.000Z', 'da goi trao doi'), null, { content: '' }],
    });
    expect(entries).toEqual([
      {
        createdAt: '2026-09-01T00:00:00.000Z',
        channel: 'IN_PERSON',
        content: 'da goi trao doi',
        outcome: null,
      },
    ]);
  });
});

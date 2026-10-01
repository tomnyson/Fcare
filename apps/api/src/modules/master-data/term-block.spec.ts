import { currentTermBlock } from '@fcare/shared-types';

const FA26 = {
  startDate: new Date('2026-09-01T00:00:00Z'),
  endDate: new Date('2026-12-31T00:00:00Z'),
  currentBlockOverride: null,
};

describe('currentTermBlock — kỳ chia 2 block theo điểm giữa kỳ', () => {
  it('nửa đầu kỳ → block 1', () => {
    expect(currentTermBlock(FA26, new Date('2026-09-20T00:00:00Z'))).toBe(1);
  });

  it('từ điểm giữa kỳ trở đi → block 2', () => {
    expect(currentTermBlock(FA26, new Date('2026-11-01T00:00:00Z'))).toBe(2);
  });

  it('trước ngày bắt đầu → block 1; sau ngày kết thúc → block 2', () => {
    expect(currentTermBlock(FA26, new Date('2026-08-01T00:00:00Z'))).toBe(1);
    expect(currentTermBlock(FA26, new Date('2027-01-15T00:00:00Z'))).toBe(2);
  });

  it('ADMIN ghi đè block hiện tại → dùng giá trị ghi đè', () => {
    expect(
      currentTermBlock(
        { ...FA26, currentBlockOverride: 2 },
        new Date('2026-09-05T00:00:00Z'),
      ),
    ).toBe(2);
  });

  it('nhận ngày dạng chuỗi ISO (dữ liệu từ API phía web)', () => {
    expect(
      currentTermBlock(
        {
          startDate: '2026-09-01T00:00:00Z',
          endDate: '2026-12-31T00:00:00Z',
        },
        new Date('2026-12-01T00:00:00Z'),
      ),
    ).toBe(2);
  });
});

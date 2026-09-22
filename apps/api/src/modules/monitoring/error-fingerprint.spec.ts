import {
  errorFingerprint,
  normalizeForFingerprint,
  parseWeekParam,
  previousWeekStart,
  weekStartOf,
} from './error-fingerprint';

describe('weekStartOf — thứ Hai 00:00 giờ Việt Nam (UTC+7)', () => {
  it('giữa tuần → về thứ Hai tuần đó', () => {
    // Thứ Tư 23/09/2026 10:00 giờ VN = 03:00Z
    expect(weekStartOf(new Date('2026-09-23T03:00:00Z')).toISOString()).toBe(
      '2026-09-20T17:00:00.000Z',
    );
  });

  it('Chủ nhật 23:30 giờ VN vẫn thuộc tuần trước', () => {
    expect(weekStartOf(new Date('2026-09-27T16:30:00Z')).toISOString()).toBe(
      '2026-09-20T17:00:00.000Z',
    );
  });

  it('thứ Hai 00:00 giờ VN (= Chủ nhật 17:00Z) là đầu tuần mới', () => {
    expect(weekStartOf(new Date('2026-09-27T17:00:00Z')).toISOString()).toBe(
      '2026-09-27T17:00:00.000Z',
    );
  });

  it('previousWeekStart lùi đúng 7 ngày', () => {
    expect(
      previousWeekStart(new Date('2026-09-28T01:00:00Z')).toISOString(),
    ).toBe('2026-09-20T17:00:00.000Z');
  });
});

describe('parseWeekParam', () => {
  it('YYYY-MM-DD bất kỳ trong tuần → đầu tuần đó', () => {
    expect(parseWeekParam('2026-09-24')?.toISOString()).toBe(
      '2026-09-20T17:00:00.000Z',
    );
  });
  it('sai định dạng → null', () => {
    expect(parseWeekParam('24/09/2026')).toBeNull();
    expect(parseWeekParam('2026-13-40')).toBeNull();
  });
});

describe('errorFingerprint', () => {
  const base = {
    source: 'HTTP' as const,
    context: null,
    route: 'GET /api/students/:id',
    message: 'Record 3f2b8c1e-9a4d-4c2e-8f1a-0b2c3d4e5f60 not found (row 42)',
  };

  it('uuid và con số khác nhau → cùng nhóm', () => {
    const other = {
      ...base,
      message: 'Record 11111111-2222-3333-4444-555555555555 not found (row 7)',
    };
    expect(errorFingerprint(base)).toBe(errorFingerprint(other));
  });

  it('route khác → nhóm khác', () => {
    expect(errorFingerprint(base)).not.toBe(
      errorFingerprint({ ...base, route: 'GET /api/alerts/:id' }),
    );
  });

  it('normalizeForFingerprint thay số/uuid/hex bằng #', () => {
    expect(
      normalizeForFingerprint('job 123 id deadbeefcafe failed at 10ms'),
    ).toBe('job # id # failed at #ms');
  });
});

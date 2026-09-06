import { describe, expect, it } from 'vitest';
import {
  currentKind,
  EMPTY_RUN,
  formatCommitResult,
  isRunFinished,
  remainingKinds,
  type ImportRun,
} from './import-run-status';

const CHAIN: ImportRun = {
  order: ['catalog', 'lecturer', 'schedule'],
  position: 0,
  results: [],
  stoppedAt: null,
};

describe('currentKind', () => {
  it('trả null khi chưa có lượt chạy', () => {
    expect(currentKind(EMPTY_RUN)).toBeNull();
  });

  it('trả loại tại vị trí đang xử lý', () => {
    expect(currentKind(CHAIN)).toBe('catalog');
    expect(currentKind({ ...CHAIN, position: 2 })).toBe('schedule');
  });

  it('trả null khi vị trí vượt quá danh sách (đã chạy hết)', () => {
    expect(currentKind({ ...CHAIN, position: 3 })).toBeNull();
  });
});

describe('remainingKinds', () => {
  it('liệt kê các loại sau vị trí hiện tại, không gồm loại đang xử lý', () => {
    expect(remainingKinds(CHAIN)).toEqual(['lecturer', 'schedule']);
    expect(remainingKinds({ ...CHAIN, position: 1 })).toEqual(['schedule']);
  });

  it('rỗng ở loại cuối hoặc khi đã chạy hết', () => {
    expect(remainingKinds({ ...CHAIN, position: 2 })).toEqual([]);
    expect(remainingKinds({ ...CHAIN, position: 3 })).toEqual([]);
    expect(remainingKinds(EMPTY_RUN)).toEqual([]);
  });

  it('vẫn liệt kê loại chưa chạy khi chuỗi bị dừng giữa chừng', () => {
    const stopped: ImportRun = { ...CHAIN, position: 1, stoppedAt: 'lecturer' };
    expect(remainingKinds(stopped)).toEqual(['schedule']);
    expect(currentKind(stopped)).toBe('lecturer');
  });
});

describe('isRunFinished', () => {
  it('false khi chưa có lượt chạy', () => {
    expect(isRunFinished(EMPTY_RUN)).toBe(false);
  });

  it('false khi còn loại đang/chưa xử lý, kể cả loại cuối', () => {
    expect(isRunFinished(CHAIN)).toBe(false);
    expect(isRunFinished({ ...CHAIN, position: 2 })).toBe(false);
  });

  it('true khi vị trí đi qua hết danh sách (lượt đơn lẫn chuỗi)', () => {
    expect(isRunFinished({ ...CHAIN, position: 3 })).toBe(true);
    expect(
      isRunFinished({ order: ['gradebook'], position: 1, results: [], stoppedAt: null }),
    ).toBe(true);
  });

  it('false khi chuỗi dừng giữa chừng dù có kết quả', () => {
    expect(isRunFinished({ ...CHAIN, position: 1, stoppedAt: 'lecturer' })).toBe(false);
  });
});

describe('formatCommitResult', () => {
  it('ghép đúng câu tóm tắt', () => {
    expect(formatCommitResult({ created: 3, updated: 2, skipped: 1 })).toBe(
      'Đã ghi: 3 tạo mới, 2 cập nhật, 1 bỏ qua.',
    );
  });
});

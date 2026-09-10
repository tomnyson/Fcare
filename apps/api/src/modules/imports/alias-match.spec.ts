import { baseAliasKey, isAliasKnown, matchAlias } from './alias-match';

describe('baseAliasKey', () => {
  it('bỏ hậu tố khoá tuyển sinh của mã ngành', () => {
    expect(baseAliasKey('LTWE04')).toBe('ltwe');
    expect(baseAliasKey('LOGI01')).toBe('logi');
    expect(baseAliasKey('TKDH02')).toBe('tkdh');
    expect(baseAliasKey(' MASA01 ')).toBe('masa');
  });

  it('bỏ cả dấu nối trước số', () => {
    expect(baseAliasKey('6340302_01')).toBe('6340302');
    expect(baseAliasKey('LTAI-01')).toBe('ltai');
  });

  it('trả null khi không có hậu tố số — mã đó phải hiện lên cho admin gán', () => {
    expect(baseAliasKey('UI_DP')).toBeNull();
    expect(baseAliasKey('CE')).toBeNull();
    expect(baseAliasKey('CHNA')).toBeNull();
  });

  it('trả null khi phần gốc quá ngắn — "A1" → "a" là vô nghĩa', () => {
    expect(baseAliasKey('A1')).toBeNull();
    expect(baseAliasKey('01')).toBeNull();
  });
});

describe('matchAlias', () => {
  const map = new Map([
    ['ltwe', 'major-ltwe'],
    ['ltwe04', 'major-rieng'],
    ['digi', 'major-digi'],
  ]);

  it('khớp tuyệt đối thắng phần gốc — admin gán tay là ý muốn tường minh', () => {
    expect(matchAlias(map, 'LTWE04')).toBe('major-rieng');
  });

  it('rơi về phần gốc khi chưa có ánh xạ riêng', () => {
    expect(matchAlias(map, 'LTWE02')).toBe('major-ltwe');
  });

  it('không đoán bừa khi cả hai đều không tra được', () => {
    expect(matchAlias(map, 'DIMA01')).toBeUndefined();
    expect(matchAlias(map, 'UI_DP')).toBeUndefined();
  });
});

describe('isAliasKnown', () => {
  const keys = new Set(['ltwe', 'cntt']);

  it('ngành (allowBaseMatch) chấp nhận phần gốc', () => {
    expect(isAliasKnown(keys, 'LTWE04', true)).toBe(true);
  });

  it('bộ môn KHÔNG rơi về phần gốc — RULE 2, sai bộ môn là lộ dữ liệu', () => {
    expect(isAliasKnown(keys, 'CNTT01', false)).toBe(false);
    expect(isAliasKnown(keys, 'CNTT', false)).toBe(true);
  });
});

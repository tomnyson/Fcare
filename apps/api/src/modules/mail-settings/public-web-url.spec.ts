import {
  isLocalWebUrl,
  normalizePublicWebUrl,
  resolvePublicWebUrl,
} from './public-web-url';

describe('normalizePublicWebUrl', () => {
  it('bỏ dấu / cuối và khoảng trắng', () => {
    expect(normalizePublicWebUrl('  https://fcare.fpt.edu.vn/ ')).toBe(
      'https://fcare.fpt.edu.vn',
    );
  });

  it('giữ đường dẫn con (web chạy dưới /fcare)', () => {
    expect(normalizePublicWebUrl('https://x.edu.vn/fcare//')).toBe(
      'https://x.edu.vn/fcare',
    );
  });

  it('rỗng → null', () => {
    expect(normalizePublicWebUrl('   ')).toBeNull();
    expect(normalizePublicWebUrl(null)).toBeNull();
  });
});

describe('resolvePublicWebUrl', () => {
  it('ưu tiên giá trị ADMIN lưu trong DB', () => {
    expect(
      resolvePublicWebUrl('https://fcare.fpt.edu.vn/', {
        WEB_BASE_URL: 'https://env.example',
        WEB_ORIGIN: 'http://localhost:3000',
      }),
    ).toBe('https://fcare.fpt.edu.vn');
  });

  it('DB trống → WEB_BASE_URL → WEB_ORIGIN → localhost', () => {
    expect(
      resolvePublicWebUrl(null, {
        WEB_BASE_URL: 'https://base.example/',
        WEB_ORIGIN: 'https://origin.example',
      }),
    ).toBe('https://base.example');
    expect(
      resolvePublicWebUrl(null, { WEB_ORIGIN: 'https://origin.example' }),
    ).toBe('https://origin.example');
    expect(resolvePublicWebUrl(null, {})).toBe('http://localhost:3000');
  });
});

describe('isLocalWebUrl', () => {
  it('nhận ra localhost/127.0.0.1', () => {
    expect(isLocalWebUrl('http://localhost:3000')).toBe(true);
    expect(isLocalWebUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalWebUrl('https://fcare.fpt.edu.vn')).toBe(false);
  });
});

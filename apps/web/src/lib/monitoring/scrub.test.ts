import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubUrl, scrubUrlsInText } from './scrub';

describe('scrubUrl', () => {
  it('bỏ query và hash vì có thể chứa từ khoá tìm tên sinh viên', () => {
    expect(scrubUrl('http://localhost:3000/students?term=FA26&q=Nguy%E1%BB%85n#top')).toBe(
      'http://localhost:3000/students',
    );
    expect(scrubUrl('/api/students?q=abc')).toBe('/api/students');
  });

  it('giữ nguyên đường dẫn không có query', () => {
    expect(scrubUrl('/students/7f1c')).toBe('/students/7f1c');
  });

  it('null/rỗng trả về đúng giá trị đó', () => {
    expect(scrubUrl(null)).toBeNull();
    expect(scrubUrl('')).toBe('');
  });
});

describe('scrubUrlsInText', () => {
  it('cắt query của URL nằm giữa câu (breadcrumb request)', () => {
    expect(scrubUrlsInText('GET /api/students?q=Lan&page=2 failed')).toBe(
      'GET /api/students failed',
    );
  });
});

describe('scrubBreadcrumb', () => {
  it('bỏ hẳn breadcrumb console vì log có thể in dữ liệu sinh viên', () => {
    expect(scrubBreadcrumb({ type: 'log', message: 'x', metadata: {} })).toBe(false);
  });

  it('bỏ chữ trên nút được bấm, chỉ giữ selector', () => {
    const crumb = {
      type: 'user',
      message: 'UI click',
      metadata: { targetText: 'Nguyễn Văn A', targetSelector: 'TABLE > TR > TD' },
    };
    expect(scrubBreadcrumb(crumb)).toBe(true);
    expect(crumb.metadata).toEqual({ targetSelector: 'TABLE > TR > TD' });
  });

  it('cắt query trong metadata điều hướng và request', () => {
    const nav = {
      type: 'navigation',
      message: 'History pushState',
      metadata: { from: '/students?q=Lan', to: '/students/1?tab=care', state: {} },
    };
    const request = {
      type: 'request',
      message: 'fetch() failed',
      metadata: { request: 'GET http://localhost:3001/api/students?q=Lan', status: 500 },
    };
    const nextNav = {
      type: 'navigation',
      message: 'History pushState',
      metadata: {
        from: '/login',
        to: '/login',
        state: { __PRIVATE_NEXTJS_INTERNALS_TREE: ['/login?q=Nguyen%20Van%20A'] },
        prevState: { __PRIVATE_NEXTJS_INTERNALS_TREE: ['__PAGE__?{"q":"Lan"}'] },
      },
    };
    scrubBreadcrumb(nextNav);
    // state của history (cây router Next) chứa nguyên query → bỏ hẳn
    expect(nextNav.metadata).toEqual({ from: '/login', to: '/login' });
    scrubBreadcrumb(nav);
    scrubBreadcrumb(request);
    expect(nav.metadata).toEqual({ from: '/students', to: '/students/1' });
    expect(request.metadata).toEqual({
      request: 'GET http://localhost:3001/api/students',
      status: 500,
    });
  });
});

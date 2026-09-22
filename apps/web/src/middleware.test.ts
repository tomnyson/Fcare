import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

function request(path: string, withSession = false) {
  const req = new NextRequest(new URL(path, 'http://localhost:3000'));
  if (withSession) req.cookies.set('fcare_refresh', 'token');
  return req;
}

describe('middleware — đường dẫn đăng nhập', () => {
  it('/admin/login luôn đưa về /login (trang /login tự chuyển sang dashboard nếu còn phiên)', () => {
    for (const withSession of [true, false]) {
      const response = middleware(request('/admin/login', withSession));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/login');
      expect(new URL(response.headers.get('location') ?? '').search).toBe('');
    }
  });

  it('trang cần đăng nhập mà không có cookie phiên → /login?next=…', () => {
    const location = middleware(request('/students')).headers.get('location') ?? '';
    expect(new URL(location).pathname).toBe('/login');
    expect(new URL(location).searchParams.get('next')).toBe('/students');
  });

  it('có cookie phiên → cho qua', () => {
    expect(middleware(request('/admin/users', true)).headers.get('location')).toBeNull();
  });
});

describe('middleware — /admin', () => {
  it('đã đăng nhập vào /admin → /dashboard', () => {
    const location = middleware(request('/admin', true)).headers.get('location') ?? '';
    expect(new URL(location).pathname).toBe('/dashboard');
  });

  it('chưa đăng nhập vào /admin → /login như mọi trang cần đăng nhập', () => {
    const location = middleware(request('/admin')).headers.get('location') ?? '';
    expect(new URL(location).pathname).toBe('/login');
  });
});

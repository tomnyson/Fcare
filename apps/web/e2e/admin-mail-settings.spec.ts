import { expect, test, type Page } from '@playwright/test';

/**
 * /admin/mail — toàn bộ API được mock qua `page.route` nên test không cần
 * DB, Redis hay SMTP thật: xem cấu hình, lưu, gửi thử, và chặn role thường.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

interface MockCalls {
  put: unknown[];
  test: unknown[];
}

const me = (role: string) => ({
  user: {
    id: 'u1',
    staffCode: 'admin',
    fullName: 'Quản trị',
    roles: [role],
    departmentId: null,
    consented: true,
    mustChangePassword: false,
  },
  requiresConsent: false,
  mustChangePassword: false,
});

const envView = {
  host: 'localhost',
  port: 1025,
  secure: false,
  username: null,
  hasPassword: false,
  fromName: 'FCare',
  fromEmail: 'fcare-noreply@fpt.edu.vn',
  enabled: true,
  source: 'ENV',
  encryptionReady: true,
  lastTestedAt: null,
  lastTestOk: null,
  updatedAt: null,
  updatedBy: null,
};

/**
 * Mock có trạng thái: sau khi PUT, GET trả về bản đã lưu (source DATABASE)
 * giống API thật — trang invalidate query và đọc lại ngay sau khi lưu.
 */
async function mockSession(page: Page, role: string, calls: MockCalls) {
  let current: Record<string, unknown> = envView;
  await page.context().addCookies([{ name: 'fcare_refresh', value: 'e2e-mock', url: BASE_URL }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = me(role);
    else if (path.endsWith('/unread-count')) data = { count: 0 };
    else if (path.endsWith('/admin/mail-settings') && method === 'GET') data = current;
    else if (path.endsWith('/admin/mail-settings') && method === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.put.push(body);
      current = {
        ...envView,
        host: body.host,
        port: body.port,
        secure: body.secure,
        username: body.username ?? null,
        hasPassword: typeof body.password === 'string' && body.password.length > 0,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
        enabled: body.enabled,
        source: 'DATABASE',
        updatedAt: '2026-09-16T01:00:00Z',
        updatedBy: { id: 'u1', fullName: 'Quản trị' },
      };
      data = current;
    } else if (path.endsWith('/admin/mail-settings/test')) {
      calls.test.push(route.request().postDataJSON());
      data = { ok: true, sentAt: '2026-09-16T01:00:00Z', usingSaved: true };
    }
    await route.fulfill({ json: { success: true, data, error: null } });
  });
}

test('admin lưu cấu hình SMTP và gửi mail thử', async ({ page }) => {
  const calls: MockCalls = { put: [], test: [] };
  await mockSession(page, 'ADMIN', calls);
  await page.goto('/admin/mail');
  await expect(page.getByRole('heading', { name: 'Cấu hình email' })).toBeVisible();
  await expect(page.getByText('Đang dùng biến môi trường')).toBeVisible();

  await page.getByRole('button', { name: 'Microsoft 365' }).click();
  await expect(page.getByLabel('Máy chủ SMTP')).toHaveValue('smtp.office365.com');
  await page.getByLabel('Tài khoản SMTP').fill('fcare@fpt.edu.vn');
  await page.getByLabel('Mật khẩu SMTP').fill('app-secret');
  await page.getByRole('button', { name: 'Lưu cấu hình' }).click();
  await expect(page.getByText('Đã lưu cấu hình.')).toBeVisible();
  expect(calls.put[0]).toMatchObject({
    host: 'smtp.office365.com',
    port: 587,
    username: 'fcare@fpt.edu.vn',
    password: 'app-secret',
  });
  await expect(page.getByText('Cấu hình trong hệ thống')).toBeVisible();

  await page.getByLabel('Gửi tới').fill('ai@gmail.com');
  await page.getByRole('button', { name: 'Gửi mail thử' }).click();
  await expect(page.getByText('phải thuộc miền @fpt.edu.vn')).toBeVisible();
  expect(calls.test).toHaveLength(0);

  await page.getByLabel('Gửi tới').fill('admin@fpt.edu.vn');
  await page.getByRole('button', { name: 'Gửi mail thử' }).click();
  await expect(page.getByText(/Đã gửi mail thử tới admin@fpt.edu.vn/)).toBeVisible();
  expect(calls.test[0]).toMatchObject({ to: 'admin@fpt.edu.vn' });
});

test('giảng viên không thấy menu và bị chặn ở /admin/mail', async ({ page }) => {
  await mockSession(page, 'LECTURER', { put: [], test: [] });
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Cấu hình email' })).toHaveCount(0);
  await page.goto('/admin/mail');
  await expect(
    page.getByText('Chỉ quản trị viên mới cấu hình được email hệ thống.'),
  ).toBeVisible();
});

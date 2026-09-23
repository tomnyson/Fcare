import { expect, type Page } from '@playwright/test';
import { trackImportCalls } from './rate-limit';

/**
 * Tài khoản demo trong seed dev (xem README.md — mọi tài khoản dùng chung mật
 * khẩu `Fcare@123`). Ghi đè bằng biến môi trường khi chạy trên DB khác.
 */
const ADMIN_CODE = process.env.E2E_ADMIN_CODE ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Fcare@123';
export const LECTURER_CODE = process.env.E2E_LECTURER_CODE ?? 'gv.binh';
const LECTURER_PASSWORD = process.env.E2E_LECTURER_PASSWORD ?? 'Fcare@123';
const SA_OFFICER_CODE = process.env.E2E_SA_OFFICER_CODE ?? 'ctsv.lan';
const SA_OFFICER_PASSWORD = process.env.E2E_SA_OFFICER_PASSWORD ?? 'Fcare@123';

/**
 * Đăng nhập rồi KÝ CAM KẾT. Consent gate (`ConsentGuard`, mã `CONSENT_REQUIRED`)
 * bắt buộc mỗi phiên đăng nhập phải ký, nên không có đường tắt nào bỏ bước này
 * mà vẫn gọi được API dữ liệu — fixture phải làm đúng như người dùng thật.
 */
export async function login(page: Page, staffCode: string, password: string): Promise<void> {
  // Gắn bộ đếm throttler trước request đầu tiên của phiên.
  trackImportCalls(page);
  await page.goto('/login');
  // WebKit có thể tương tác với SSR form trước khi React hydration hoàn tất,
  // khiến giá trị ô đầu tiên bị state rỗng ghi đè khi ô thứ hai đang được điền.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Mã nhân viên').fill(staffCode);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await page.waitForURL('**/consent', { timeout: 30_000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Xác nhận cam kết' }).click();

  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Tổng quan', level: 1 })).toBeVisible();
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await login(page, ADMIN_CODE, ADMIN_PASSWORD);
}

export async function loginAsLecturer(page: Page): Promise<void> {
  await login(page, LECTURER_CODE, LECTURER_PASSWORD);
}

export async function loginAsSaOfficer(page: Page): Promise<void> {
  await login(page, SA_OFFICER_CODE, SA_OFFICER_PASSWORD);
}

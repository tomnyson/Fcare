import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

/**
 * Phụ lục mục 4 — khi API lỗi, UI phải nói LỖI. Trạng thái rỗng giả ("không có
 * dữ liệu") trong lúc thật ra là 500 sẽ khiến người dùng tin rằng dữ liệu không
 * tồn tại, nguy hiểm hơn là báo lỗi.
 */
const SERVER_ERROR_BODY = JSON.stringify({
  success: false,
  data: null,
  error: 'Lỗi máy chủ giả lập cho test',
});

test.describe('Nhánh lỗi tải dữ liệu', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('danh sách sinh viên lỗi 500 hiện thông báo lỗi, không phải danh sách rỗng', async ({
    page,
  }) => {
    await page.route(/\/api\/students\?/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: SERVER_ERROR_BODY,
      }),
    );

    await page.goto('/students');
    // Next.js chèn sẵn một <div role="alert"> rỗng (route announcer) vào mọi trang,
    // nên phải lọc theo nội dung thay vì lấy alert đầu tiên.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Lỗi máy chủ giả lập cho test' }),
    ).toBeVisible();
    await expect(page.getByText('Không có sinh viên nào khớp bộ lọc.')).toHaveCount(0);
  });

  test('lịch sử import lỗi 500 hiện thông báo lỗi, không phải "chưa có lượt import"', async ({
    page,
  }) => {
    await page.route(/\/api\/imports$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: SERVER_ERROR_BODY,
      }),
    );

    await page.goto('/import-export');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Lỗi máy chủ giả lập cho test' }),
    ).toBeVisible();
    await expect(page.getByText('Chưa có lượt import nào.')).toHaveCount(0);
  });

  test('danh mục bộ môn lỗi 500 hiện thông báo lỗi thay cho bảng rỗng', async ({ page }) => {
    await page.route(/\/api\/departments$/, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: SERVER_ERROR_BODY,
      }),
    );

    await page.goto('/master-data/departments');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Lỗi máy chủ giả lập cho test' }),
    ).toBeVisible();
    await expect(page.getByText('Chưa có bộ môn nào', { exact: false })).toHaveCount(0);
  });
});

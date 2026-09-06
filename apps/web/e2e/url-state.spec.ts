import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

/**
 * Phụ lục mục 1 — URL là nguồn sự thật của bộ lọc/tab, và back/forward phải
 * đồng bộ NGƯỢC lại vào ô input (chỗ vừa sửa ở M4 Task 13: `useEffect` theo
 * `submittedSearch` trong app/(dashboard)/students/page.tsx).
 */
test.describe('Trạng thái nằm trên URL', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('bộ lọc sinh viên ghi vào URL và sống sót qua reload', async ({ page }) => {
    await page.goto('/students');
    const search = page.getByLabel('Tìm sinh viên');
    await search.fill('SE');
    await page.getByRole('button', { name: 'Tìm kiếm' }).click();
    await expect(page).toHaveURL(/search=SE/);

    await page.getByLabel('Trạng thái', { exact: true }).selectOption('STUDYING');
    await expect(page).toHaveURL(/status=STUDYING/);
    await expect(page).toHaveURL(/search=SE/);

    // Checkbox là controlled component lấy giá trị từ URL: sau cú click, React
    // chỉ tick lại khi `router.replace` đã cập nhật query param. `check()` xác
    // minh ngay lập tức nên sẽ đỏ oan — click rồi chờ trạng thái mới đúng.
    const missingMajor = page.getByRole('checkbox', { name: 'Chưa gán ngành' });
    await missingMajor.click();
    await expect(page).toHaveURL(/missingMajor=true/);
    await expect(missingMajor).toBeChecked();

    await page.reload();
    await expect(search).toHaveValue('SE');
    await expect(page.getByLabel('Trạng thái', { exact: true })).toHaveValue('STUDYING');
    await expect(page.getByRole('checkbox', { name: 'Chưa gán ngành' })).toBeChecked();
  });

  test('back/forward đồng bộ lại ô tìm kiếm theo query param', async ({ page }) => {
    await page.goto('/students?search=SE');
    const search = page.getByLabel('Tìm sinh viên');
    await expect(search).toHaveValue('SE');

    // Đổi URL bằng history API (App Router có hook sẵn cho pushState) — KHÔNG
    // remount trang, nên ô input chỉ đúng nhờ effect đồng bộ theo URL.
    await page.evaluate(() => {
      window.history.pushState(null, '', '/students?search=IT');
    });
    await expect(search).toHaveValue('IT');
    await expect(page).toHaveURL(/search=IT/);

    await page.goBack();
    await expect(page).toHaveURL(/search=SE/);
    await expect(search).toHaveValue('SE');

    await page.goForward();
    await expect(page).toHaveURL(/search=IT/);
    await expect(search).toHaveValue('IT');
  });

  test('tab danh mục đào tạo nằm trên đường dẫn và back quay lại đúng tab', async ({ page }) => {
    await page.goto('/master-data/subjects');
    // Sidebar cũng có link cùng tên — chỉ xét thanh tab trong trang.
    const tabs = page.getByRole('navigation', { name: 'Danh mục đào tạo' });
    await expect(tabs.getByRole('link', { name: 'Môn học' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await tabs.getByRole('link', { name: 'Lớp học phần' }).click();
    await expect(page).toHaveURL(/\/master-data\/class-sections$/);
    await expect(tabs.getByRole('link', { name: 'Lớp học phần' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goBack();
    await expect(page).toHaveURL(/\/master-data\/subjects$/);
    await expect(tabs.getByRole('link', { name: 'Môn học' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

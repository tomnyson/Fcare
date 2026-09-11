import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';
import { ASSIGNMENT_FILE_RAW } from './fixtures/files';
import { discardPreview, gotoImportExport, uploadForPreview } from './fixtures/import';

/**
 * File nguồn thật có cột email ở sheet "T.Kê" (32 ô, cột I, KHÔNG có header).
 *
 * RULE 1 vẫn nguyên: email không bao giờ vào hệ thống. Khác trước ở chỗ file
 * không còn bị từ chối — ô dính bị xoá ngay trong bộ nhớ trước khi parser chạm
 * tới, phần dữ liệu học vụ vẫn import được. Đây là lưới an toàn cho ràng buộc
 * bảo mật, không phải test giao diện: nếu ngày nào đó ô PII lọt vào bản xem
 * trước, hai test này đỏ.
 */
const warningBanner = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'đã bỏ qua' });

test.describe('RULE 1 — ô PII bị bỏ qua, file vẫn import được', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await gotoImportExport(page);
  });

  test('file chứa email vẫn đọc được; ô email bị bỏ qua và báo rõ vị trí', async ({ page }) => {
    await uploadForPreview(page, 'lecturer', ASSIGNMENT_FILE_RAW);

    await expect(page.getByRole('alert').filter({ hasText: 'File bị từ chối' })).toHaveCount(0);

    const warning = warningBanner(page);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('T.Kê');
    // Admin mở Excel thấy chữ cái cột, không phải số thứ tự.
    await expect(warning).toContainText('cột I');
    await expect(warning).toContainText('email');
    // Thông báo nêu vị trí nhưng KHÔNG in lại giá trị PII.
    await expect(warning).not.toContainText('@');

    // Không một ô email nào lọt vào bản xem trước — bằng chứng parser chỉ thấy
    // workbook đã sạch.
    await expect(page.locator('section[aria-labelledby="preview-heading"]')).not.toContainText(
      '@',
    );

    await discardPreview(page);
  });

  test('quét PII toàn workbook, kể cả sheet mà loại import này không đọc', async ({ page }) => {
    // Loại "Danh mục môn học" chỉ đọc sheet "3.1.Môn-BM" — email nằm ở sheet
    // "T.Kê". Vẫn phải bị xoá và vẫn phải báo cho người duyệt.
    await uploadForPreview(page, 'catalog', ASSIGNMENT_FILE_RAW);

    const warning = warningBanner(page);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText('T.Kê');
    await expect(warning).not.toContainText('@');

    await discardPreview(page);
  });
});

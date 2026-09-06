import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';
import { ASSIGNMENT_FILE_RAW } from './fixtures/files';
import { gotoImportExport, selectImportKind } from './fixtures/import';
import { paceImportCall } from './fixtures/rate-limit';

/**
 * File nguồn thật có cột email ở sheet "T.Kê" (32 ô). RULE 1 bắt từ chối TOÀN
 * BỘ file. Đây là lưới an toàn cho ràng buộc bảo mật, không phải test giao diện:
 * nếu ngày nào đó có người "nới" cho qua để import chạy được, hai test này đỏ.
 */
const RAW_FILE_NAME = path.basename(ASSIGNMENT_FILE_RAW);

test.describe('RULE 1 — file chứa PII bị từ chối', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await gotoImportExport(page);
  });

  test('file chứa email bị từ chối toàn bộ, không ghi dòng nào', async ({ page }) => {
    await selectImportKind(page, 'lecturer');
    await page.locator('#import-term').fill('SU26');
    await page.locator('#import-file').setInputFiles(ASSIGNMENT_FILE_RAW);
    await paceImportCall('upload');
    await page.getByRole('button', { name: '3. Đọc file và xem trước' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'File bị từ chối' });
    await expect(alert).toBeVisible({ timeout: 90_000 });
    await expect(alert).toContainText('từ chối');
    await expect(alert).toContainText('email');
    // Thông báo nêu vị trí nhưng KHÔNG in ra giá trị PII.
    await expect(alert).not.toContainText('@');
    await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeHidden();

    // Không có lô nào được tạo cho file này — từ chối ở cổng vào, không phải
    // tạo lô rồi mới lọc.
    await expect(page.getByRole('cell', { name: RAW_FILE_NAME })).toHaveCount(0);
  });

  test('file bị từ chối kể cả khi loại import không đọc sheet chứa email', async ({ page }) => {
    // Loại "Danh mục môn học" chỉ đọc sheet "3.1.Môn-BM" — email nằm ở sheet
    // "T.Kê". Quét PII là toàn workbook nên vẫn phải từ chối.
    await selectImportKind(page, 'catalog');
    await page.locator('#import-term').fill('SU26');
    await page.locator('#import-file').setInputFiles(ASSIGNMENT_FILE_RAW);
    await paceImportCall('upload');
    await page.getByRole('button', { name: '3. Đọc file và xem trước' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'File bị từ chối' });
    await expect(alert).toBeVisible({ timeout: 90_000 });
    await expect(alert).toContainText('T.Kê');
    await expect(alert).not.toContainText('@');
    await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeHidden();
  });
});

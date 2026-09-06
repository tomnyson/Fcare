import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';
import {
  ASSIGNMENT_FILE_CLEAN,
  ASSIGNMENT_FILE_UNMAPPED_ALIAS,
  GRADEBOOK_FILE,
  UNMAPPED_ALIAS,
} from './fixtures/files';
import {
  chainProgress,
  chainResult,
  commitPreview,
  discardPreview,
  gotoImportExport,
  historyRows,
  IMPORT_KIND_LABELS,
  reloadImportExport,
  selectImportKinds,
  uploadForPreview,
} from './fixtures/import';
import { paceImportCall } from './fixtures/rate-limit';

const CLEAN_FILE_NAME = path.basename(ASSIGNMENT_FILE_CLEAN);
const UNMAPPED_FILE_NAME = path.basename(ASSIGNMENT_FILE_UNMAPPED_ALIAS);

/**
 * Các test trong file này CHẠY THEO THỨ TỰ và phụ thuộc nhau đúng như thứ tự
 * import bắt buộc: danh mục môn học → giảng viên → lịch lớp → bảng điểm. Sửa
 * điểm, gán giảng viên và gán ngành hàng loạt chỉ có dữ liệu để chạy sau khi
 * các bước import phía trên đã ghi. `workers: 1` + `fullyParallel: false` ở
 * playwright.config.ts là thứ bảo đảm điều đó.
 *
 * File .xlsx dùng ở đây là bản ĐÃ XOÁ Ô PII sinh ra trong global setup — bản
 * gốc còn email và bị RULE 1 từ chối (xem pii-rejection.spec.ts).
 */
test.describe.configure({ mode: 'serial' });

test.describe('Quản trị viên import và dọn dữ liệu', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('import danh mục môn học có bước xem trước rồi mới ghi', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'catalog', ASSIGNMENT_FILE_CLEAN);

    // Xem trước phải hiện TRƯỚC khi có bất kỳ dòng nào được ghi.
    await expect(
      page.getByRole('heading', { name: `Xem trước — ${CLEAN_FILE_NAME}` }),
    ).toBeVisible();
    await expect(page.getByText('Sẽ ghi', { exact: true })).toBeVisible();

    await commitPreview(page);
  });

  test('xem trước nêu rõ nhãn bộ môn chưa ánh xạ rồi huỷ được lô', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'catalog', ASSIGNMENT_FILE_UNMAPPED_ALIAS);

    // Nhãn lạ xuất hiện cả trong bảng xem trước lẫn khối cảnh báo; chỉ khối
    // cảnh báo mới chứng minh UI đã NHẬN RA nó chưa có ánh xạ.
    const warning = page.getByRole('status').filter({ hasText: /nhãn bộ môn chưa có ánh xạ/ });
    await expect(warning).toBeVisible();
    await expect(warning.getByText(UNMAPPED_ALIAS)).toBeVisible();

    await discardPreview(page);
  });

  test('huỷ lô là soft-cancel: lô vẫn nằm trong lịch sử với trạng thái Đã huỷ', async ({
    page,
  }) => {
    await gotoImportExport(page);
    const cancelled = historyRows(page)
      .filter({ hasText: UNMAPPED_FILE_NAME })
      .filter({ hasText: 'Đã huỷ' });
    await expect(cancelled.first()).toBeVisible();
    // Không còn nút nối lại: lô đã huỷ không thể commit tiếp.
    await expect(cancelled.first().getByRole('button', { name: 'Chờ xác nhận' })).toHaveCount(0);
  });

  test('nối lại được lô PENDING bị bỏ dở sau khi rời trang', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'catalog', ASSIGNMENT_FILE_CLEAN);

    // Rời trình hướng dẫn giữa chừng — state trong React mất, lô vẫn PENDING.
    await reloadImportExport(page);
    await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeHidden();

    const pendingRow = historyRows(page)
      .filter({ hasText: CLEAN_FILE_NAME })
      .filter({ has: page.getByRole('button', { name: 'Chờ xác nhận' }) })
      .first();
    await expect(pendingRow).toBeVisible();

    await paceImportCall('preview');
    await pendingRow.getByRole('button', { name: 'Chờ xác nhận' }).click();

    await expect(page.getByRole('heading', { name: `Xem trước — ${CLEAN_FILE_NAME}` })).toBeVisible(
      {
        timeout: 90_000,
      },
    );
    await commitPreview(page);
  });

  test('import danh sách giảng viên từ file đã xoá cột email', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'lecturer', ASSIGNMENT_FILE_CLEAN);
    await commitPreview(page);
  });

  test('import lịch nêu rõ số lớp chưa phân công giảng viên', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'schedule', ASSIGNMENT_FILE_CLEAN);

    await expect(page.getByText(/lớp chưa phân công giảng viên trong file nguồn/)).toBeVisible();
    await commitPreview(page);
  });

  test('tick ba loại cùng file rồi chạy chuỗi tuần tự từ một lần upload', async ({ page }) => {
    await gotoImportExport(page);
    // Tick lộn thứ tự — hệ thống phải tự sắp lại catalog → lecturer → schedule.
    await selectImportKinds(page, ['schedule', 'catalog', 'lecturer']);
    await page.locator('#import-term').fill('SU26');
    await page.locator('#import-file').setInputFiles(ASSIGNMENT_FILE_CLEAN);
    await paceImportCall('upload');
    await page.getByRole('button', { name: '3. Đọc file và xem trước' }).click();

    const order = ['catalog', 'lecturer', 'schedule'] as const;
    for (const [index, kind] of order.entries()) {
      await expect(chainProgress(page, index + 1, order.length, kind)).toBeVisible({
        timeout: 90_000,
      });
      const confirm = page.getByRole('button', { name: /^✓ Xác nhận ghi \d+ dòng$/ });
      await expect(confirm).toBeVisible({ timeout: 90_000 });

      // Xác nhận loại này sẽ tự động upload lại file cho loại kế tiếp — giữ
      // nhịp cả hai handler trước khi bấm.
      await paceImportCall('commit');
      if (index < order.length - 1) await paceImportCall('upload');
      await confirm.click();
      await expect(chainResult(page, kind)).toBeVisible({ timeout: 90_000 });
    }

    await expect(page.getByText('Đã ghi xong 3/3 loại dữ liệu.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeHidden();
    await expect(page.getByText(/^Đang xử lý/)).toHaveCount(0);
  });

  test('huỷ lô giữa chuỗi thì dừng lại, loại còn lại không chạy', async ({ page }) => {
    await gotoImportExport(page);
    await selectImportKinds(page, ['catalog', 'lecturer']);
    await page.locator('#import-term').fill('SU26');
    await page.locator('#import-file').setInputFiles(ASSIGNMENT_FILE_UNMAPPED_ALIAS);
    await paceImportCall('upload');
    await page.getByRole('button', { name: '3. Đọc file và xem trước' }).click();

    await expect(chainProgress(page, 1, 2, 'catalog')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('heading', { name: `Xem trước — ${UNMAPPED_FILE_NAME}` })).toBeVisible(
      { timeout: 90_000 },
    );
    await discardPreview(page);

    const stopped = page.getByRole('alert').filter({ hasText: 'Đã dừng chuỗi import' });
    await expect(stopped).toBeVisible();
    await expect(stopped).toContainText(`Chưa chạy: ${IMPORT_KIND_LABELS.lecturer}`);
    await expect(page.getByText(/^Đang xử lý/)).toHaveCount(0);
    // Không có lô giảng viên nào được tạo từ file này.
    await expect(
      historyRows(page)
        .filter({ hasText: UNMAPPED_FILE_NAME })
        .filter({ hasText: IMPORT_KIND_LABELS.lecturer }),
    ).toHaveCount(0);
  });

  test('import bảng điểm rồi sửa được điểm một sinh viên', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'gradebook', GRADEBOOK_FILE);
    await commitPreview(page);

    await page.goto('/master-data/class-sections');
    // Lớp có sinh viên ghi danh = ô "Sĩ số" khác 0.
    const rowWithStudents = page
      .locator('tbody tr')
      .filter({ hasNot: page.getByRole('cell', { name: '0', exact: true }) })
      .first();
    await expect(rowWithStudents).toBeVisible();
    await rowWithStudents.getByRole('link', { name: 'Bảng điểm' }).click();

    const firstScore = page.getByLabel(/^Điểm tổng kết của /).first();
    await expect(firstScore).toBeVisible();
    const current = await firstScore.inputValue();
    const next = current === '9.1' ? '8.7' : '9.1';
    await firstScore.fill(next);

    await page.getByRole('button', { name: 'Lưu bảng điểm' }).click();
    // ĐÚNG 1 dòng: UI chỉ gửi dòng đã sửa (Task 13). Nếu nó gửi cả lớp, con số
    // này sẽ khác — hoặc request 400 vì điểm thô nhiều chữ số thập phân.
    await expect(page.getByText('Đã lưu 1 dòng điểm.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/^Điểm tổng kết của /).first()).toHaveValue(next);
  });

  test('thêm ánh xạ bộ môn rồi thấy nó trong danh sách', async ({ page }) => {
    // Nhãn duy nhất theo lần chạy: alias có unique constraint, dùng lại nhãn cũ
    // sẽ 409 ở lần chạy thứ hai.
    const alias = `E2E-ANH-XA-${Date.now().toString(36).toUpperCase()}`;

    await page.goto('/master-data/department-aliases');
    await page.getByRole('button', { name: '+ Thêm ánh xạ bộ môn' }).click();
    await page.getByLabel('Nhãn trong file Excel').fill(alias);
    await page.getByLabel('Bộ môn đích').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Lưu', exact: true }).click();

    const row = page.locator('tbody tr').filter({ hasText: alias });
    await expect(row).toBeVisible();

    // Dọn lại để lần chạy sau không tích rác trong bảng ánh xạ thật.
    await row.getByRole('button', { name: 'Xóa' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(page.locator('tbody tr').filter({ hasText: alias })).toHaveCount(0);
  });

  test('gán giảng viên cho một lớp chưa phân công', async ({ page }) => {
    await page.goto('/master-data/class-sections');
    // Import lịch để lại nhiều lớp trống GV; ô "Giảng viên" của chúng hiển thị "—".
    const row = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: '—', exact: true }) })
      .first();
    await expect(row).toBeVisible();
    const sectionCode = (await row.getByRole('cell').first().innerText()).trim();

    await row.getByRole('button', { name: 'Sửa' }).click();
    const lecturerSelect = page.getByLabel('Giảng viên', { exact: true });
    // Danh sách giảng viên tải bất đồng bộ sau khi modal mở.
    await expect
      .poll(() => lecturerSelect.locator('option').count(), { timeout: 30_000 })
      .toBeGreaterThan(1);

    const optionText = (await lecturerSelect.locator('option').nth(1).innerText()).trim();
    // Option là "{staffCode} — {fullName}"; bảng chỉ hiển thị fullName.
    const lecturerName = optionText.split('—').slice(1).join('—').trim();
    await lecturerSelect.selectOption({ index: 1 });

    // Form sửa dùng nhãn "Cập nhật"; chỉ form thêm mới mới là "Lưu".
    await page.getByRole('button', { name: 'Cập nhật' }).click();

    const updatedRow = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: sectionCode, exact: true }) });
    await expect(updatedRow).toContainText(lecturerName);
  });

  test('lọc sinh viên chưa gán ngành rồi gán ngành hàng loạt', async ({ page }) => {
    await page.goto('/students');
    // Checkbox lấy trạng thái từ URL nên `check()` xác minh quá sớm — xem chú
    // thích ở url-state.spec.ts.
    const missingMajorFilter = page.getByRole('checkbox', { name: 'Chưa gán ngành' });
    await missingMajorFilter.click();
    await expect(missingMajorFilter).toBeChecked();
    await expect(page.getByText(/sinh viên chưa gán ngành/)).toBeVisible();
    // Bộ lọc nằm trên URL nên tải lại trang vẫn giữ nguyên.
    await expect(page).toHaveURL(/missingMajor=true/);

    const checkboxes = page.getByLabel(/^Chọn sinh viên /);
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const before = await checkboxes.count();
    test.skip(before === 0, 'Dữ liệu dev không còn sinh viên thiếu ngành để gán.');

    await checkboxes.first().check();
    await page.getByLabel('Ngành cần gán').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Gán ngành cho sinh viên đã chọn' }).click();
    await expect(page.getByText(/^Đã gán ngành cho \d+ sinh viên\.$/)).toBeVisible();
    await expect(checkboxes).toHaveCount(before - 1);
  });

  test('lịch sử import ghi lại mọi lượt', async ({ page }) => {
    await gotoImportExport(page);
    await expect(page.getByRole('heading', { name: 'Lịch sử import' })).toBeVisible();
    await expect(historyRows(page).filter({ hasText: 'Đã ghi' }).first()).toBeVisible();
    await expect(historyRows(page).filter({ hasText: 'Đã huỷ' }).first()).toBeVisible();
  });
});

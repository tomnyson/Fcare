import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';
import {
  GRADE_ATTENDANCE_FILE,
  ROSTER_FILE,
  SECTION_LIST_FILE,
  TERM_FILES_TERM,
} from './fixtures/files';
import {
  commitPreview,
  gotoImportExport,
  historyRows,
  IMPORT_KIND_LABELS,
  selectImportKinds,
  uploadForPreview,
} from './fixtures/import';

/**
 * Bộ 3 file nhà trường gửi đầu mỗi kỳ (`docs/tailieu/`). Các test CHẠY THEO
 * THỨ TỰ và phụ thuộc nhau đúng như thứ tự import bắt buộc:
 * 1/3 danh sách lớp → 2/3 sinh viên lớp môn → 3/3 điểm và chuyên cần.
 * Chạy sai thứ tự thì dòng nào cũng bị bỏ qua vì lớp học phần chưa tồn tại.
 *
 * Ba file này là ba file VẬT LÝ khác nhau nên KHÔNG tick chung một lượt upload
 * được (khác `ImportSource`) — mỗi loại một lần tải riêng.
 *
 * Số dòng ghi/bỏ qua phụ thuộc dữ liệu danh mục môn học đang có trong DB dev,
 * nên các test chỉ khẳng định luồng chạy đúng, không chốt cứng con số.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Import bộ file đầu kỳ', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('tick loại đầu kỳ thì bỏ tick loại đọc từ file khác', async ({ page }) => {
    await gotoImportExport(page);
    // `selectImportKinds` tự kiểm tra từng loại được tick sau mỗi lần bấm.
    await selectImportKinds(page, ['catalog', 'section-list']);

    // Loại cũ phải bị bỏ tick: wizard chạy chuỗi bằng cách upload lại đúng file
    // vừa chọn, tick hai loại khác file sẽ ghi sai dữ liệu.
    await expect(page.locator('input[name="import-kind"][value="catalog"]')).not.toBeChecked();

    await selectImportKinds(page, ['roster']);
    await expect(page.locator('input[name="import-kind"][value="section-list"]')).not.toBeChecked();
  });

  test('1/3 danh sách lớp: xem trước rồi ghi lớp học phần', async ({ page }) => {
    await gotoImportExport(page);
    await uploadForPreview(page, 'section-list', SECTION_LIST_FILE, TERM_FILES_TERM);

    await expect(
      page.getByRole('heading', { name: `Xem trước — ${path.basename(SECTION_LIST_FILE)}` }),
    ).toBeVisible();
    // Cột theo allowlist của loại này (IMPORT_PAYLOAD_COLUMNS.SECTION_LIST).
    await expect(page.getByRole('columnheader', { name: 'Mã lớp học phần' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Giảng viên' })).toBeVisible();

    await commitPreview(page);
  });

  test('2/3 sinh viên lớp môn: tạo hồ sơ sinh viên và ghi danh', async ({ page }) => {
    // ~2800 dòng: upload + commit lâu hơn hẳn các file khác.
    test.slow();
    await gotoImportExport(page);
    await uploadForPreview(page, 'roster', ROSTER_FILE, TERM_FILES_TERM);

    await expect(page.getByRole('columnheader', { name: 'MSSV' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Lớp học phần' })).toBeVisible();
    // RULE 1: bản xem trước không được lộ bất kỳ cột PII nào của sinh viên.
    await expect(page.getByRole('columnheader', { name: /Email|Điện thoại|CCCD/i })).toHaveCount(0);

    await commitPreview(page);
  });

  test('3/3 điểm và chuyên cần: cảnh báo bỏ qua lớp thi lại rồi ghi', async ({ page }) => {
    // ~2800 dòng: upload + commit lâu hơn hẳn các file khác.
    test.slow();
    await gotoImportExport(page);
    await uploadForPreview(page, 'grade-attendance', GRADE_ATTENDANCE_FILE, TERM_FILES_TERM);

    // Lớp thi lại cuối kỳ (TL_EOS) không nằm trong kế hoạch giảng dạy — parser
    // bỏ qua và phải nói rõ cho người import biết.
    await expect(
      page.getByRole('status').filter({ hasText: /lớp thi lại \(TL_EOS\)/ }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Buổi nghỉ' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tổng buổi' })).toBeVisible();

    await commitPreview(page);
  });

  test('lịch sử hiện đúng nhãn của cả ba loại đầu kỳ', async ({ page }) => {
    await gotoImportExport(page);
    for (const kind of ['section-list', 'roster', 'grade-attendance'] as const) {
      // Nhãn (không phải mã thô "SECTION_LIST") mới chứng minh bảng lịch sử tra
      // đúng theo `ImportKind` của API.
      await expect(
        historyRows(page)
          .filter({ hasText: IMPORT_KIND_LABELS[kind] })
          .filter({ hasText: 'Đã ghi' })
          .first(),
      ).toBeVisible();
    }
  });
});

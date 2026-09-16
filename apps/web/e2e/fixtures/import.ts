import { expect, type Page } from '@playwright/test';
import { paceImportCall, waitOutThrottleWindow } from './rate-limit';

export const IMPORT_KIND_LABELS = {
  catalog: 'Danh mục môn học',
  lecturer: 'Danh sách giảng viên',
  schedule: 'Lịch và phân công lớp',
  gradebook: 'Bảng điểm',
  'section-list': 'Đầu kỳ 1/3 — Danh sách lớp',
  roster: 'Đầu kỳ 2/3 — Sinh viên lớp môn',
  'grade-attendance': 'Đầu kỳ 3/3 — Điểm và chuyên cần',
} as const;

export type ImportKindKey = keyof typeof IMPORT_KIND_LABELS;

const PREVIEW_TIMEOUT = 90_000;

/**
 * Checkbox chọn loại import là `sr-only` bên trong `<label>` — người dùng bấm
 * vào thẻ label, nên test cũng bấm label rồi kiểm tra checkbox thật đã được tick.
 */
export async function selectImportKind(page: Page, kind: ImportKindKey): Promise<void> {
  const label = IMPORT_KIND_LABELS[kind];
  await page.locator('label').filter({ hasText: label }).first().click();
  await expect(page.locator(`input[name="import-kind"][value="${kind}"]`)).toBeChecked();
}

/** Tick nhiều loại (cùng file phân công) theo đúng thứ tự truyền vào. */
export async function selectImportKinds(
  page: Page,
  kinds: readonly ImportKindKey[],
): Promise<void> {
  for (const kind of kinds) {
    await selectImportKind(page, kind);
  }
}

/** Dòng tiến độ của chuỗi import nhiều loại: "Đang xử lý i/n: <nhãn loại>". */
export function chainProgress(page: Page, step: number, total: number, kind: ImportKindKey) {
  return page.getByText(`Đang xử lý ${step}/${total}: ${IMPORT_KIND_LABELS[kind]}`);
}

/** Dòng kết quả "Đã ghi: …" của một loại trong danh sách kết quả chuỗi. */
export function chainResult(page: Page, kind: ImportKindKey) {
  return page
    .getByRole('list', { name: 'Kết quả import' })
    .getByRole('listitem')
    .filter({ hasText: IMPORT_KIND_LABELS[kind] })
    .filter({ hasText: /Đã ghi: \d+ tạo mới, \d+ cập nhật, \d+ bỏ qua\./ });
}

/** Điền hoặc chọn học kỳ (hỗ trợ cả select dropdown và input text). */
export async function setImportTerm(page: Page, term: string): Promise<void> {
  const termLocator = page.locator('#import-term');
  const tag = await termLocator.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'select') {
    const hasOption = (await termLocator.locator(`option[value="${term}"]`).count()) > 0;
    if (hasOption) {
      await termLocator.selectOption(term);
    } else {
      await termLocator.selectOption('__custom__');
      await page.locator('#import-term').fill(term);
    }
  } else {
    await termLocator.fill(term);
  }
}

/** Chọn loại + file rồi bấm "Đọc file và xem trước"; trả về khi bản xem trước hiện ra. */
export async function uploadForPreview(
  page: Page,
  kind: ImportKindKey,
  filePath: string,
  term = 'SU26',
): Promise<void> {
  await selectImportKind(page, kind);
  await setImportTerm(page, term);
  await page.locator('#import-file').setInputFiles(filePath);
  await paceImportCall('upload');
  await page.getByRole('button', { name: '3. Đọc file và xem trước' }).click();
  await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeVisible({
    timeout: PREVIEW_TIMEOUT,
  });
}

/** Bấm "Xác nhận ghi N dòng" và chờ dòng kết quả "Đã ghi: …". */
export async function commitPreview(page: Page): Promise<void> {
  await paceImportCall('commit');
  await page.getByRole('button', { name: /^✓ Xác nhận ghi \d+ dòng$/ }).click();
  await expect(page.getByText(/^Đã ghi: \d+ tạo mới, \d+ cập nhật, \d+ bỏ qua\.$/)).toBeVisible({
    timeout: PREVIEW_TIMEOUT,
  });
}

/**
 * Bấm "Huỷ lô này" và chờ wizard quay về bước chọn file.
 *
 * Phải chờ CHÍNH response của `DELETE /imports/:id`: UI ẩn bản xem trước ngay
 * khi mutation bắt đầu, nên nếu test kết thúc ở đó thì context đóng và request
 * huỷ có thể bị bỏ dở — lô kẹt ở PENDING và test soft-cancel ngay sau đó đỏ oan.
 */
export async function discardPreview(page: Page): Promise<void> {
  await paceImportCall('discard');
  const discarded = page.waitForResponse(
    (response) =>
      response.request().method() === 'DELETE' && /\/api\/imports\/[^/]+$/.test(response.url()),
    { timeout: PREVIEW_TIMEOUT },
  );
  await page.getByRole('button', { name: 'Huỷ lô này' }).click();
  const response = await discarded;
  expect(response.status(), 'DELETE /imports/:id phải thành công').toBeLessThan(400);
  await expect(page.getByRole('heading', { name: /^Xem trước —/ })).toBeHidden({
    timeout: PREVIEW_TIMEOUT,
  });
}

/**
 * Mở trang Import/Export. Mỗi lần tải trang đều gọi `GET /imports` (lịch sử) —
 * handler `list` cũng nằm trong trần 10 lượt/phút, và cả bộ test mở trang này
 * hơn chục lần, nên phải giữ nhịp y như các thao tác import khác.
 */
export async function gotoImportExport(page: Page): Promise<void> {
  await openImportExport(page, () => page.goto('/import-export'));
}

/** Tải lại trang Import/Export (cũng tốn một lượt `GET /imports`). */
export async function reloadImportExport(page: Page): Promise<void> {
  await openImportExport(page, () => page.reload());
}

/**
 * Mở trang rồi kiểm tra lịch sử có tải được không. Nếu API trả 429 (cửa sổ
 * throttle còn dư từ lần chạy trước — bộ đếm phía test reset mỗi lần chạy), chờ
 * hết cửa sổ rồi mở lại. Không nới giới hạn ở API, cũng không nuốt lỗi khác:
 * mọi thông báo lỗi KHÔNG phải throttle đều để nguyên cho test nhìn thấy.
 */
async function openImportExport(page: Page, open: () => Promise<unknown>): Promise<void> {
  const history = page.locator('section[aria-labelledby="history-heading"]');
  for (let attempt = 0; ; attempt += 1) {
    await paceImportCall('list');
    await open();
    // Chờ truy vấn lịch sử ngã ngũ: hoặc có dòng, hoặc có thông báo lỗi.
    await expect(async () => {
      const settled =
        (await history.locator('tbody tr').count()) + (await history.getByRole('alert').count());
      expect(settled).toBeGreaterThan(0);
    }).toPass({ timeout: 30_000 });

    const throttled = history.getByRole('alert').filter({ hasText: 'Too Many Requests' });
    if ((await throttled.count()) === 0 || attempt >= 2) return;
    await waitOutThrottleWindow('list');
  }
}

/** Số dòng của lịch sử import (bảng dưới cùng trang Import/Export). */
export function historyRows(page: Page) {
  return page.locator('section[aria-labelledby="history-heading"] tbody tr');
}

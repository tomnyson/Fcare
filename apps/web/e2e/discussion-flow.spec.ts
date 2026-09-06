import { expect, test, type Page } from '@playwright/test';
import { loginAsLecturer, loginAsSaOfficer } from './fixtures/auth';

/**
 * Luồng trao đổi nội bộ đi qua hai tài khoản thật, hai context trình duyệt
 * riêng. Giảng viên chỉ thấy sinh viên lớp mình dạy, còn cán bộ CTSV thấy toàn
 * trường — nên sinh viên lấy từ danh sách của giảng viên chắc chắn nằm trong
 * phạm vi của cả hai.
 */

/**
 * Mốc duy nhất cho mỗi lần chạy, chỉ gồm chữ cái. Dãy số dài bị lớp chặn PII từ
 * chối (giống CCCD/CMND), nên mốc dạng số sẽ làm test đỏ oan.
 */
function uniqueTag(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: 10 }, () =>
    letters[Math.floor(Math.random() * letters.length)],
  ).join('');
}

/** Mở sinh viên đầu tiên trong danh sách và trả về id của sinh viên đó. */
async function openFirstStudent(page: Page): Promise<string> {
  await page.goto('/students');
  const firstLink = page.locator('a[href^="/students/"]').first();
  await expect(firstLink).toBeVisible({ timeout: 30_000 });
  const href = await firstLink.getAttribute('href');
  expect(href).toBeTruthy();
  return (href as string).replace('/students/', '');
}

test('tin nhắn giảng viên gửi hiện ở tài khoản CTSV', async ({ browser }) => {
  // Nội dung duy nhất mỗi lần chạy: E2E chạy trên DB dev có dữ liệu tích luỹ.
  // Mốc phải là chữ, KHÔNG phải số: `Date.now()` là dãy 13 chữ số nên bị chính
  // lớp chặn PII từ chối như một số CCCD — test sẽ đỏ vì fixture, không phải vì lỗi.
  const marker = `E2E trao doi ${uniqueTag()}`;

  const lecturerContext = await browser.newContext();
  const lecturerPage = await lecturerContext.newPage();
  await loginAsLecturer(lecturerPage);
  const studentId = await openFirstStudent(lecturerPage);

  await lecturerPage.goto(`/students/${studentId}?tab=discussion`);
  const composer = lecturerPage.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(marker);
  await lecturerPage.getByRole('button', { name: 'Gửi' }).click();
  await expect(lecturerPage.getByText(marker)).toBeVisible({ timeout: 30_000 });

  const officerContext = await browser.newContext();
  const officerPage = await officerContext.newPage();
  await loginAsSaOfficer(officerPage);
  await officerPage.goto(`/students/${studentId}?tab=discussion`);
  await expect(officerPage.getByText(marker)).toBeVisible({ timeout: 30_000 });

  await lecturerContext.close();
  await officerContext.close();
});

test('composer từ chối số điện thoại và giữ nguyên nội dung đã gõ', async ({ page }) => {
  await loginAsLecturer(page);
  const studentId = await openFirstStudent(page);
  await page.goto(`/students/${studentId}?tab=discussion`);

  const withPii = 'Goi phu huynh 0912345678 giup em';
  const composer = page.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(withPii);
  await page.getByRole('button', { name: 'Gửi' }).click();

  await expect(page.getByText(/số điện thoại/)).toBeVisible({ timeout: 30_000 });
  // Bị chặn thì người dùng chỉ phải sửa, không phải gõ lại từ đầu.
  await expect(composer).toHaveValue(withPii);
  // Và tuyệt đối không có tin nào lọt vào luồng. Phải soi trong các thẻ <article>
  // (mỗi thẻ là một tin) chứ không quét cả trang: engine text của Playwright coi
  // giá trị trong ô soạn thảo là text, nên quét cả trang sẽ luôn thấy 1 kết quả.
  await expect(page.locator('article').filter({ hasText: withPii })).toHaveCount(0);
});

test('giảng viên thu hồi được tin của chính mình', async ({ page }) => {
  const marker = `E2E thu hoi ${uniqueTag()}`;
  await loginAsLecturer(page);
  const studentId = await openFirstStudent(page);
  await page.goto(`/students/${studentId}?tab=discussion`);

  const composer = page.getByLabel('Nội dung trao đổi');
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(marker);
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.getByText(marker)).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Thu hồi' }).last().click();
  await expect(page.getByText(marker)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('Tin nhắn đã thu hồi').last()).toBeVisible();
});

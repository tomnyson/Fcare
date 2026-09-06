import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';
import { gotoImportExport } from './fixtures/import';

/**
 * Phụ lục mục 3 — chụp 320px và 1440px cho bốn trang chính và khẳng định body
 * không tràn ngang. Ảnh lưu vào thư mục output của Playwright (đã gitignore)
 * và đính kèm vào báo cáo để soi lại khi cần.
 */
const VIEWPORTS = [
  { name: '320', width: 320, height: 900 },
  { name: '1440', width: 1440, height: 900 },
] as const;

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: Math.max(root.scrollWidth, document.body.scrollWidth),
      clientWidth: root.clientWidth,
    };
  });
  // +1 cho sai số làm tròn subpixel.
  expect(
    overflow.scrollWidth,
    `body tràn ngang: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function capture(page: Page, name: string): Promise<void> {
  const info = test.info();
  const file = info.outputPath(`${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await info.attach(name, { path: file, contentType: 'image/png' });
}

test.describe('Responsive 320 và 1440', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  for (const viewport of VIEWPORTS) {
    test(`các trang chính hiển thị đúng ở ${viewport.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/master-data/class-sections');
      await expect(page.getByRole('heading', { name: 'Đào tạo', level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `master-data-class-sections-${viewport.name}`);

      await page.goto('/students');
      await expect(page.getByRole('heading', { name: 'Sinh viên', level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `students-${viewport.name}`);

      await gotoImportExport(page);
      await expect(
        page.getByRole('heading', { name: 'Import / Export dữ liệu', level: 1 }),
      ).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `import-export-${viewport.name}`);

      // Trang bảng điểm cần id lớp thật — lấy từ liên kết đầu tiên ở danh sách lớp.
      await page.goto('/master-data/class-sections');
      const gradesLink = page.locator('tbody tr').first().getByRole('link', { name: 'Bảng điểm' });
      await expect(gradesLink).toBeVisible();
      await gradesLink.click();
      await expect(page.getByRole('heading', { name: /^Điểm lớp /, level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, `section-grades-${viewport.name}`);
    });
  }
});

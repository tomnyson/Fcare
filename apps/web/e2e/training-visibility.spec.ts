import { expect, test } from '@playwright/test';
import { loginAsAdmin, loginAsLecturer, loginAsSaOfficer } from './fixtures/auth';

async function expectTrainingAreaHidden(page: Parameters<typeof loginAsLecturer>[0]) {
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation.getByText('Đào tạo', { exact: true })).toHaveCount(0);
  await expect(navigation.locator('a[href^="/master-data/"]')).toHaveCount(0);

  for (const path of [
    '/master-data',
    '/master-data/departments',
    '/master-data/department-aliases',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Tổng quan', level: 1 })).toBeVisible();
  }
}

test('giảng viên không thấy và không mở trực tiếp được khu vực Đào tạo', async ({ page }) => {
  await loginAsLecturer(page);
  await expectTrainingAreaHidden(page);
});

test('cán bộ CTSV không thấy và không mở trực tiếp được khu vực Đào tạo', async ({ page }) => {
  await loginAsSaOfficer(page);
  await expectTrainingAreaHidden(page);

  await page.goto('/import-export');
  await expect(
    page.getByRole('heading', { name: 'Import / Export dữ liệu', level: 1 }),
  ).toBeVisible();
});

test('quản trị viên vẫn thấy và mở được khu vực Đào tạo', async ({ page }) => {
  await loginAsAdmin(page);
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation.getByText('Đào tạo', { exact: true })).toBeVisible();
  await expect(navigation.locator('a[href^="/master-data/"]')).toHaveCount(7);

  await page.goto('/master-data/departments');
  await expect(page.getByRole('heading', { name: 'Đào tạo', level: 1 })).toBeVisible();
});

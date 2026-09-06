import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './fixtures/auth';

/**
 * Phụ lục mục 2 — điều hướng bằng bàn phím và quản lý focus. Điều kiện: mọi
 * hành động phải là `<button>` thật (kích hoạt được bằng Enter/Space) và hộp
 * thoại phải trả focus về đúng phần tử đã mở nó.
 */
test.describe('Bàn phím và focus', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Tab đi đúng thứ tự qua form lọc sinh viên', async ({ page }) => {
    await page.goto('/students');
    const search = page.getByLabel('Tìm sinh viên');
    await search.focus();
    await expect(search).toBeFocused();

    // Thứ tự DOM của thanh lọc = thứ tự đọc trên màn hình; không có tabindex thủ công.
    // Nút submit nằm ngay cạnh ô tìm kiếm trên cùng một hàng nên đứng trước lưới lọc.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Tìm kiếm' })).toBeFocused();

    for (const label of ['Học kỳ', 'Lớp', 'Ngành', 'Giảng viên', 'Lớp học phần', 'Trạng thái']) {
      await page.keyboard.press('Tab');
      await expect(page.getByLabel(label, { exact: true })).toBeFocused();
    }

    await page.keyboard.press('Tab');
    await expect(page.getByRole('checkbox', { name: 'Chưa gán ngành' })).toBeFocused();

    // Enter trên nút submit thật sự gửi form → bộ lọc lên URL.
    await search.fill('SE');
    await page.getByRole('button', { name: 'Tìm kiếm' }).press('Enter');
    await expect(page).toHaveURL(/search=SE/);
  });

  test('nút Sửa mở hộp thoại bằng Enter và trả focus về khi đóng', async ({ page }) => {
    await page.goto('/master-data/departments');
    const editButton = page.locator('tbody tr').first().getByRole('button', { name: 'Sửa' });
    await expect(editButton).toBeVisible();
    // Phải là <button> thật, không phải <div onClick>.
    await expect(editButton).toHaveJSProperty('tagName', 'BUTTON');

    await editButton.focus();
    await editButton.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Focus phải nằm trong hộp thoại, không kẹt lại phía sau lớp phủ.
    await expect(dialog).toContainText('Sửa bộ môn');
    const focusInsideDialog = await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    );
    expect(focusInsideDialog).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(editButton).toBeFocused();
  });

  test('nút thêm mới kích hoạt được bằng phím Space', async ({ page }) => {
    await page.goto('/master-data/departments');
    const addButton = page.getByRole('button', { name: '+ Thêm bộ môn' });
    await expect(addButton).toHaveJSProperty('tagName', 'BUTTON');

    await addButton.focus();
    await addButton.press(' ');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Nút đóng của hộp thoại cũng phải dùng được bằng bàn phím.
    await page.getByRole('button', { name: 'Đóng' }).press('Enter');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(addButton).toBeFocused();
  });
});

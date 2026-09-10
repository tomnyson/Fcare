import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsLecturer, LECTURER_CODE } from './fixtures/auth';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/**
 * Sinh viên SE190008 là SV cuối lớp SE1901 trong seed — seed chỉ nhận xét ba SV
 * đầu, nên cặp (gv.binh, PRF192-SE1901-SU25, SE190008) chắc chắn còn trống.
 * Ràng buộc unique (lecturerId, classSectionId, studentId) khiến test không thể
 * chạy lại hai lần nếu không dọn, nên test tự xoá bản nhận xét mình tạo ra.
 */
const STUDENT_CODE = 'SE190008';
const SECTION_CODE = 'PRF192-SE1901-SU25';
const TERM = 'SU25';

interface EvaluationRow {
  id: string;
  term: string;
  lecturer?: { staffCode: string } | null;
  classSection?: { code: string } | null;
}

/** Xoá đúng bản nhận xét của test (gv.binh + lớp PRF192) để chạy lại được. */
async function removeTestEvaluation(request: APIRequestContext, studentId: string) {
  const response = await request.get(`${API_URL}/api/evaluations?studentId=${studentId}`);
  if (!response.ok()) return;
  const body = (await response.json()) as { data: EvaluationRow[] | null };
  const targets = (body.data ?? []).filter(
    (row) =>
      row.term === TERM &&
      row.lecturer?.staffCode === LECTURER_CODE &&
      row.classSection?.code === SECTION_CODE,
  );
  for (const target of targets) {
    // Mutation dùng cookie auth nên CsrfGuard đòi header này.
    await request.delete(`${API_URL}/api/evaluations/${target.id}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
  }
}

async function openStudent(page: Page): Promise<string> {
  await page.goto(`/students?search=${STUDENT_CODE}`);
  const link = page.locator('a[href^="/students/"]').first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const href = await link.getAttribute('href');
  await link.click();
  return (href as string).replace('/students/', '');
}

test('giảng viên nhận xét theo dải điểm, DRS cộng 12 điểm → cấp 3, rồi sửa lại bản cũ', async ({
  page,
}) => {
  await loginAsLecturer(page);
  const studentId = await openStudent(page);
  await removeTestEvaluation(page.request, studentId);

  await page.getByRole('tab', { name: 'Nhận xét' }).click();
  await expect(page.getByTestId('add-evaluation')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('add-evaluation').click();

  const sectionSelect = page.getByLabel('Lớp học phần');
  // gv.binh chỉ đứng lớp PRF192 của SE1901 trong kỳ SU25 → option đầu sau ô trống.
  await expect(sectionSelect.locator('option').nth(1)).toContainText(SECTION_CODE);
  await sectionSelect.selectOption({ index: 1 });
  await page
    .getByRole('group', { name: 'Khả năng học tập' })
    .getByRole('radio', { name: /học yếu, học đối phó/ })
    .check();
  await page
    .getByRole('group', { name: 'Thái độ học tập' })
    .getByRole('radio', { name: /vắng rất nhiều/ })
    .check();
  await page.getByLabel('Số buổi đã vắng').fill('3');
  await page.getByRole('checkbox', { name: /Nguy cơ cấm thi/ }).check();
  // Lần chạy lại trên DB cũ thì lớp này đã có nhận xét → nút là "Cập nhật nhận xét".
  await page.getByRole('button', { name: /(Lưu|Cập nhật) nhận xét/ }).click();

  // R_L 3 + R_A 3 + R_C 3 + R_H 3 + R_P 0 = 12 → cấp 3 (dải 9-12).
  await expect(page.getByTestId('drs-total')).toHaveText('12', { timeout: 30_000 });
  await expect(page.getByTestId('drs-level')).toContainText('Cấp 3');

  // Mở lại đúng lớp đó: form phải nạp bản cũ và chuyển sang sửa, không tạo mới
  // (tạo mới sẽ dính unique và trả lỗi cho giảng viên).
  await page.getByTestId('add-evaluation').click();
  await expect(sectionSelect.locator('option').nth(1)).toContainText('(đã nhận xét)');
  await sectionSelect.selectOption({ index: 1 });
  await expect(page.getByLabel('Số buổi đã vắng')).toHaveValue('3');
  await expect(page.getByRole('checkbox', { name: /Nguy cơ cấm thi/ })).toBeChecked();
  await page.getByLabel('Số buổi đã vắng').fill('0');
  await page.getByRole('button', { name: 'Cập nhật nhận xét' }).click();

  // Bỏ 3 điểm chuyên cần khỏi tổng cũ: 12 - 3 = 9.
  await expect(page.getByTestId('drs-total')).toHaveText('9', { timeout: 30_000 });

  await removeTestEvaluation(page.request, studentId);
});

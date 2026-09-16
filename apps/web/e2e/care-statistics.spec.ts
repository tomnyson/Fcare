import { expect, test, type Page } from '@playwright/test';

const summary = {
  studentCount: 2, caredCount: 1, uncaredCount: 1, careRate: 50,
  evaluationCount: 1, careLogCount: 0,
};
const report = {
  term: { code: 'FA26', name: 'Fall 2026', startDate: '2026-09-01T00:00:00Z', endDate: '2026-12-31T23:59:59Z' },
  generatedAt: '2026-09-15T10:00:00Z',
  lecturers: [{
    ...summary, id: 'teacher-1', staffCode: 'GV01', fullName: 'Nguyễn Minh An',
    department: { code: 'IT', name: 'Công nghệ thông tin' }, sectionCount: 1,
    sections: [{
      ...summary, id: 'section-1', code: 'IT101', subjectName: 'Lập trình',
      students: [
        { id: 'student-1', studentCode: 'SV001', fullName: 'Trần Bình', classCode: 'GD01', cared: true, evaluationCount: 1, careLogCount: 0, lastCareAt: '2026-09-14T10:00:00Z', alertLevel: 3 },
        { id: 'student-2', studentCode: 'SV002', fullName: 'Lê Chi', classCode: 'GD01', cared: false, evaluationCount: 0, careLogCount: 0, lastCareAt: null, alertLevel: null },
      ],
    }],
  }],
};

async function mockSession(page: Page, role = 'ADMIN') {
  // Mock session is confined to this browser context; no dev database writes.
  await page.context().addCookies([{ name: 'fcare_refresh', value: 'e2e-mock', url: 'http://localhost:3000' }]);
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = { user: { id: 'viewer', staffCode: 'viewer', fullName: 'Người quản lý', roles: [role], departmentId: 'dept-1', consented: true, mustChangePassword: false }, requiresConsent: false, mustChangePassword: false };
    else if (path.endsWith('/terms/current')) data = report.term;
    else if (path.endsWith('/students/filter-options')) data = { terms: ['FA26', 'SU26'], departments: [], majors: [], classes: [] };
    else if (path.endsWith('/statistics/care')) data = report;
    else if (path.endsWith('/unread-count')) data = { count: 0 };
    await route.fulfill({ json: { success: true, data, error: null } });
  });
}

test('care tab expands teacher and class; filters reach Excel request', async ({ page }) => {
  await mockSession(page);
  await page.goto('/statistics?term=FA26&tab=care');
  await expect(page.getByRole('tab', { name: 'Chăm sóc sinh viên' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: /Nguyễn Minh An/ })).toBeVisible();
  await page.getByRole('button', { name: /Nguyễn Minh An/ }).click();
  await page.getByRole('button', { name: /IT101/ }).click();
  await expect(page.getByText('SV001', { exact: true })).toBeVisible();
  await expect(page.getByText('SV002', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/fcare-care-statistics.png', fullPage: true });
  await page.getByLabel('Giảng viên', { exact: true }).selectOption('teacher-1');
  const filtered = page.waitForRequest((request) => request.url().includes('/statistics/care?') && request.url().includes('status=uncared'));
  await page.getByLabel('Trạng thái chăm sóc', { exact: true }).selectOption('uncared');
  await filtered;
  await page.route('**/api/statistics/care/export.xlsx?**', async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('term')).toBe('FA26');
    expect(url.searchParams.get('lecturerId')).toBe('teacher-1');
    expect(url.searchParams.get('status')).toBe('uncared');
    await route.fulfill({ body: 'mock workbook', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'content-disposition': 'attachment; filename="care.xlsx"' } });
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Xuất Excel/ }).click();
  expect((await download).suggestedFilename()).toBe('cham-soc-FA26.xlsx');
  await page.getByRole('tab', { name: 'Giảng viên', exact: true }).click();
  await expect(page).toHaveURL(/tab=lecturers/);
  await expect(page.getByRole('tab')).toHaveCount(5);
});

test('lecturer cannot see or fetch the care tab through a direct URL', async ({ page }) => {
  await mockSession(page, 'LECTURER');
  const careCalls: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/statistics/care')) careCalls.push(request.url()); });
  await page.goto('/statistics?term=FA26&tab=care');
  await expect(page.getByRole('tab', { name: 'Lớp học phần' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Chăm sóc sinh viên' })).toHaveCount(0);
  expect(careCalls).toEqual([]);
});

test('care tab requires a term and displays API failures', async ({ page }) => {
  await mockSession(page);
  await page.goto('/statistics?term=&tab=care');
  await expect(page.getByText('Chọn một học kỳ cụ thể để xem mức độ chăm sóc sinh viên.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Xuất Excel/ })).toHaveCount(0);
  await page.route('**/api/statistics/care?**', (route) => route.fulfill({ status: 400, json: { success: false, data: null, error: 'Học kỳ chưa được cấu hình.' } }));
  await page.getByLabel('Học kỳ', { exact: true }).selectOption('FA26');
  await expect(page.getByText('Học kỳ chưa được cấu hình.', { exact: true })).toBeVisible();
});

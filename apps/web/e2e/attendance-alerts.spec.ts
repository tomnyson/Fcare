import { expect, test, type Page } from '@playwright/test';

/**
 * FLOW 2 — cảnh báo điểm danh tự động. Toàn bộ API được mock qua `page.route`,
 * không ghi Postgres dev: kiểm tra panel dashboard, nút "Chăm sóc ngay" gửi
 * `alertId` khi ghi nhật ký, pill sidebar và deep link `?alertId=` ở hồ sơ SV.
 */
const term = { code: 'FA26', name: 'Fall 2026', startDate: '2026-09-01T00:00:00Z', endDate: '2026-12-31T23:59:59Z' };
const me = (role: string, id = 'gv-1') => ({
  user: { id, staffCode: 'GV01', fullName: 'Nguyễn Minh An', roles: [role], departmentId: 'dept-1', consented: true, mustChangePassword: false },
  requiresConsent: false,
  mustChangePassword: false,
});
const student = { id: 'student-1', studentCode: 'SV001', fullName: 'Trần Bình', classCode: 'GD01' };
const owned = {
  id: 'alert-1', level: 3, status: 'OPEN', reason: 'Vắng 3 buổi lớp IT101', absentSessions: 3,
  ownerCaredAt: null, createdAt: '2026-09-15T02:00:00Z', careLogCount: 0, isOwner: true,
  student, classSection: { id: 'section-1', code: 'IT101', subjectName: 'Lập trình', lecturerName: 'Nguyễn Minh An' },
};
const other = {
  ...owned, id: 'alert-2', level: 2, absentSessions: 2, isOwner: false, careLogCount: 1,
  student: { ...student, id: 'student-2', studentCode: 'SV002', fullName: 'Lê Chi' },
  classSection: { id: 'section-2', code: 'IT102', subjectName: 'Cơ sở dữ liệu', lecturerName: 'Phạm Dũng' },
};
const overview = {
  totalStudents: 2, careLogsLast30Days: 0,
  studentsByStatus: [{ status: 'ACTIVE', count: 2 }], openAlertsByLevel: [{ level: 3, count: 1 }],
  attendancePending: 1,
};
const profileAlert = {
  id: 'alert-1', studentId: 'student-1', level: 3, status: 'OPEN', reason: 'Vắng 3 buổi lớp IT101',
  source: 'AUTO_ATTENDANCE', absentSessions: 3, ownerCaredAt: null, raisedBy: null,
  classSection: { id: 'section-1', code: 'IT101', subject: { name: 'Lập trình' } },
  resolvedBy: null, resolvedAt: null, resolutionNote: null, createdAt: '2026-09-15T02:00:00Z',
};

async function mockSession(page: Page, role: string) {
  await page.context().addCookies([{ name: 'fcare_refresh', value: 'e2e-mock', url: 'http://localhost:3000' }]);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = me(role);
    else if (path.endsWith('/terms/current')) data = term;
    else if (path.endsWith('/statistics/overview')) data = overview;
    else if (path.endsWith('/attendance-alerts/pending')) {
      const all = url.searchParams.get('scope') === 'all';
      data = { items: all ? [owned, other] : [owned], total: all ? 2 : 1, ownedTotal: 1 };
    } else if (path.endsWith('/unread-count')) data = { count: 0 };
    else if (path.endsWith('/students/student-1')) data = { ...student, dateOfBirth: null, gender: null, cohort: null, status: 'ACTIVE', major: null, department: { id: 'dept-1', code: 'IT', name: 'CNTT' } };
    else if (path.endsWith('/alerts')) data = { items: [profileAlert], total: 1, page: 1, limit: 50 };
    else if (path.endsWith('/care-logs') && route.request().method() === 'POST') data = { id: 'log-1' };
    await route.fulfill({ json: { success: true, data, error: null } });
  });
}

test('lecturer sees own attendance alert on dashboard and logs care with alertId', async ({ page }) => {
  await mockSession(page, 'LECTURER');
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '1 sinh viên cần chăm sóc sau điểm danh' })).toBeVisible();
  await expect(page.getByText('SV001', { exact: false }).first()).toBeVisible();
  // Giảng viên thường không thấy panel phạm vi bộ môn.
  await expect(page.getByText('Cảnh báo điểm danh trong phạm vi bạn theo dõi')).toHaveCount(0);
  const pill = page.getByTitle('1 cảnh báo điểm danh chờ bạn chăm sóc');
  await expect(pill).toHaveText('1');
  await page.screenshot({ path: '/tmp/fcare-attendance-dashboard.png', fullPage: true });

  await page.getByRole('button', { name: 'Chăm sóc ngay' }).click();
  await expect(page.getByRole('dialog', { name: 'Ghi nhật ký chăm sóc' })).toBeVisible();
  await expect(page.getByLabel('Nội dung')).toHaveValue(/vắng 3 buổi lớp IT101/);
  const posted = page.waitForRequest((request) => request.url().endsWith('/care-logs') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Lưu nhật ký' }).click();
  const request = await posted;
  expect(request.postDataJSON()).toMatchObject({ studentId: 'student-1', alertId: 'alert-1', channel: 'IN_PERSON' });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('head of department also sees the department-wide attendance panel', async ({ page }) => {
  await mockSession(page, 'HEAD_OF_DEPT');
  const scopes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/attendance-alerts/pending')) scopes.push(url.searchParams.get('scope') ?? '');
  });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: '1 sinh viên cần chăm sóc sau điểm danh' })).toBeVisible();
  const summary = page.getByText('Cảnh báo điểm danh trong phạm vi bạn theo dõi');
  await expect(summary).toBeVisible();
  await summary.click();
  await expect(page.getByText('SV002', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('GV Phạm Dũng')).toBeVisible();
  expect(scopes.sort()).toEqual(['all', 'owned']);
});

test('deep link ?alertId= on the student profile opens the care form for that alert', async ({ page }) => {
  await mockSession(page, 'LECTURER');
  await page.goto('/students/student-1?tab=alerts&alertId=alert-1');
  await expect(page.getByRole('tab', { name: 'Cảnh báo' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('dialog', { name: 'Ghi nhật ký chăm sóc' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Tự động (điểm danh)')).toBeVisible();
  await expect(page.getByText('Người phát: Hệ thống')).toBeVisible();
  await expect(page.getByText('Chờ giảng viên lớp chăm sóc')).toBeVisible();
  await page.getByRole('button', { name: 'Ghi nhật ký chăm sóc' }).click();
  await expect(page.getByRole('dialog', { name: 'Ghi nhật ký chăm sóc' })).toBeVisible();
});

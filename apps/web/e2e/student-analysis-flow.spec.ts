import { expect, test, type Page, type Route } from '@playwright/test';
import { loginAsLecturer } from './fixtures/auth';

const output = {
  riskLevel: 'MEDIUM' as const,
  summary: 'Kết quả học tập có xu hướng giảm nhẹ trong học kỳ gần nhất.',
  strengths: ['Duy trì chuyên cần ở phần lớn học phần'],
  trends: [{ finding: 'Điểm giảm', evidence: 'Điểm tổng kết hai môn gần nhất thấp hơn trước' }],
  riskFactors: [{ finding: 'Một môn chưa đạt', evidence: 'Kết quả hiện tại là FAIL' }],
  recommendations: ['Trao đổi với giảng viên phụ trách môn chưa đạt'],
  notificationSummary: 'Cần theo dõi kết quả học tập trong học kỳ hiện tại.',
  dataLimitations: ['Chưa có điểm cuối kỳ của một học phần'],
  suggestedLevel: 2 as const,
  forcedEscalation: null,
};

function envelope(data: unknown) {
  return { success: true, data, error: null };
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(envelope(data)),
  });
}

interface SendBody {
  confirmedLevel: number;
  contentSource: 'AI' | 'LECTURER';
  lecturerNote?: string;
}

async function mockAnalysisApi(page: Page) {
  let created = false;
  let sent = false;
  let dismissed = false;
  const sendBodies: SendBody[] = [];
  let summaryReadsAfterCreate = 0;
  const requestKeys: string[] = [];
  let editedOutput = output;

  await page.route('**/api/notifications/unread-count', (route) => fulfill(route, { count: 1 }));
  await page.route('**/api/notifications', (route) =>
    fulfill(route, [
      {
        id: 'notification-1',
        title: 'Phân tích học tập mới',
        body: output.notificationSummary,
        readAt: null,
        createdAt: new Date().toISOString(),
        targetUrl: '/student-analyses/analysis-version-1',
        alert: null,
        analysis: { id: 'analysis-version-1', riskLevel: 'MEDIUM' },
      },
    ]),
  );
  await page.route('**/api/notifications/notification-1/read', (route) =>
    fulfill(route, { read: true }),
  );

  await page.route('**/api/students/*/term-analyses?*', async (route) => {
    if (!created) {
      await fulfill(route, null);
      return;
    }
    summaryReadsAfterCreate += 1;
    const status = sent ? 'SENT' : summaryReadsAfterCreate === 1 ? 'QUEUED' : 'DRAFT';
    await fulfill(route, {
      id: 'analysis-1',
      studentId: 'student-1',
      term: 'SU25',
      owner: { id: 'lecturer-1', staffCode: 'gv.binh', fullName: 'Nguyễn Thanh Bình' },
      canManage: true,
      versions: [
        {
          id: 'analysis-version-1',
          version: 1,
          status,
          riskLevel: editedOutput.riskLevel,
          notificationSummary: editedOutput.notificationSummary,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          generatedAt: new Date().toISOString(),
          sentAt: sent ? new Date().toISOString() : null,
          errorMessage: null,
        },
      ],
    });
  });
  await page.route('**/api/students/*/term-analyses', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { idempotencyKey: string };
      requestKeys.push(body.idempotencyKey);
      if (requestKeys.length === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            data: null,
            error: 'Hàng đợi phân tích AI hiện không khả dụng.',
            code: 'ANALYSIS_QUEUE_UNAVAILABLE',
          }),
        });
        return;
      }
      created = true;
    }
    await fulfill(route, { queued: true });
  });

  await page.route('**/api/term-analysis-versions/analysis-version-1/recipients*', (route) =>
    fulfill(route, {
      systemLevel: 2,
      level: 2,
      recipients: [
        {
          id: 'lecturer-2',
          staffCode: 'gv.chi',
          fullName: 'Phạm Kim Chi',
          departmentId: 'department-1',
          openedAt: null,
        },
      ],
    }),
  );
  await page.route('**/api/term-analysis-versions/analysis-version-1/send', async (route) => {
    sendBodies.push(route.request().postDataJSON() as SendBody);
    sent = true;
    await fulfill(route, { queued: true });
  });
  await page.route('**/api/term-analysis-versions/analysis-version-1/dismiss', async (route) => {
    dismissed = true;
    await fulfill(route, { versionId: 'analysis-version-1', dismissed: true });
  });
  await page.route('**/api/term-analysis-versions/analysis-version-1', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as { editedOutput: typeof output };
      editedOutput = body.editedOutput;
    }
    await fulfill(route, {
      id: 'analysis-version-1',
      version: 1,
      status: sent ? 'SENT' : 'DRAFT',
      term: 'SU25',
      student: { id: 'student-1', studentCode: 'SV001', fullName: 'Sinh viên thử nghiệm' },
      owner: { id: 'lecturer-1', staffCode: 'gv.binh', fullName: 'Nguyễn Thanh Bình' },
      createdBy: { id: 'lecturer-1', staffCode: 'gv.binh', fullName: 'Nguyễn Thanh Bình' },
      reviewedBy: null,
      aiOriginal: output,
      editedOutput,
      needsSendDecision: !sent && !dismissed,
      dismissedAt: dismissed ? new Date().toISOString() : null,
      contentSource: null,
      sourceSnapshot: {
        careLogs: [
          {
            channel: 'IN_PERSON',
            content: 'Gặp sinh viên trao đổi về lịch học',
            outcome: 'Sinh viên hứa đi học đầy đủ',
            nextAction: 'Theo dõi điểm danh hai tuần',
            createdAt: '2026-09-01T02:00:00.000Z',
          },
        ],
      },
      recipients: [],
      sentAt: sent ? new Date().toISOString() : null,
      disclaimer: 'Nội dung AI chỉ mang tính hỗ trợ và đã được giảng viên duyệt.',
    });
  });

  await page.route('**/api/evaluations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await fulfill(route, {
      id: 'evaluation-mocked',
      term: 'SU25',
      academicScore: 8,
      attitudeScore: 8,
      absentSessions: 1,
      criteria: [],
      note: 'Cần theo dõi thêm',
      createdAt: new Date().toISOString(),
    });
  });

  return { requestKeys, sendBodies };
}

/** Đưa giảng viên tới bản nháp AI vừa sinh, nơi hiện lời gợi ý gửi cảnh báo. */
async function openDraftPanel(page: Page) {
  await page.goto('/students');
  await page.locator('a[href^="/students/"]').first().click();
  await page.getByRole('tab', { name: 'Nhận xét' }).click();
  await expect(page.getByLabel('Học kỳ').first()).toBeEnabled();
  await page.getByRole('button', { name: 'Tạo / cập nhật AI' }).click();
  await expect(page.getByText('Hàng đợi phân tích AI hiện không khả dụng.')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo / cập nhật AI' }).click();
  await expect(page.getByText('Bản nháp', { exact: true })).toBeVisible();
}

test('giảng viên duyệt phân tích AI rồi gửi và mở qua thông báo', async ({ page }) => {
  const analysisApi = await mockAnalysisApi(page);
  await loginAsLecturer(page);

  await page.getByRole('button', { name: /Thông báo/ }).click();
  await page.getByRole('button', { name: /Phân tích học tập mới/ }).click();
  await expect(page).toHaveURL(/\/student-analyses\/analysis-version-1$/);
  await expect(page.getByRole('heading', { name: /Phân tích AI/ })).toBeVisible();

  await page.goto('/students');
  await page.locator('a[href^="/students/"]').first().click();
  await page.getByRole('tab', { name: 'Nhận xét' }).click();

  await expect(page.getByLabel('Học kỳ').first()).toBeEnabled();
  await page.getByTestId('add-evaluation').click();
  await page.getByLabel('Lớp học phần').selectOption({ index: 1 });
  await page.getByRole('textbox', { name: 'Nhận xét' }).fill('Cần theo dõi thêm');
  // Nhãn nút đổi thành "Cập nhật nhận xét" khi lớp đã có nhận xét cũ trong DB dev
  // (E2E chạy lại trên dữ liệu còn lại của lần trước), nên khớp cả hai.
  await page.getByRole('button', { name: /(Lưu|Cập nhật) nhận xét/ }).click();
  await expect(page.getByText(/Nhận xét đã được lưu/)).toBeVisible();

  await page.getByRole('button', { name: 'Tạo / cập nhật AI' }).click();
  await expect(page.getByText('Hàng đợi phân tích AI hiện không khả dụng.')).toBeVisible();
  await page.getByRole('button', { name: 'Tạo / cập nhật AI' }).click();
  await expect(page.getByText('Bản nháp', { exact: true })).toBeVisible();
  expect(analysisApi.requestKeys[0]).toBe(analysisApi.requestKeys[1]);
  await expect(page.getByText('Phạm Kim Chi')).toBeVisible();

  await page.getByLabel('Tóm tắt phân tích').fill('Bản phân tích đã được giảng viên hiệu chỉnh.');
  await page.getByRole('button', { name: 'Lưu bản nháp' }).click();

  await expect(page.getByTestId('confirmed-level-badge')).toContainText('Cấp 2');
  await expect(page.getByText('Gửi cảnh báo cho các bên liên quan?')).toBeVisible();
  await expect(page.getByTestId('ai-summary-preview')).toContainText(
    'Cần theo dõi kết quả học tập',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('send-analysis').click();
  await expect(page.getByText('Đã gửi')).toBeVisible();
  expect(analysisApi.sendBodies[0]).toMatchObject({ confirmedLevel: 2, contentSource: 'AI' });
  expect(analysisApi.sendBodies[0].lecturerNote).toBeUndefined();
});

test('giảng viên tự soạn nội dung thì xem trước lịch sử chăm sóc gửi kèm', async ({ page }) => {
  const analysisApi = await mockAnalysisApi(page);
  await loginAsLecturer(page);
  await openDraftPanel(page);

  await page.getByRole('radio', { name: /Tôi tự soạn nội dung/ }).check();
  await expect(page.getByTestId('care-history-preview')).toContainText(
    'Gặp sinh viên trao đổi về lịch học',
  );
  // Ô nội dung được mồi sẵn bản AI để giảng viên sửa lại theo ý mình.
  await expect(page.getByLabel('Nội dung bạn muốn gửi')).toHaveValue(output.notificationSummary);

  const note = 'Sinh viên nghỉ nhiều buổi liên tiếp, cần bộ phận liên quan phối hợp hỗ trợ ngay.';
  await page.getByLabel('Nội dung bạn muốn gửi').fill(note);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('send-analysis').click();
  await expect(page.getByText('Đã gửi')).toBeVisible();
  expect(analysisApi.sendBodies[0]).toMatchObject({
    confirmedLevel: 2,
    contentSource: 'LECTURER',
    lecturerNote: note,
  });
});

test('bấm Không gửi thì giữ bản nháp và không tạo cảnh báo', async ({ page }) => {
  const analysisApi = await mockAnalysisApi(page);
  await loginAsLecturer(page);
  await openDraftPanel(page);

  await page.getByTestId('dismiss-analysis').click();
  await expect(page.getByTestId('dismiss-analysis')).toHaveCount(0);
  await expect(page.getByText('Bản nháp này chưa gửi.')).toBeVisible();
  expect(analysisApi.sendBodies).toHaveLength(0);
});

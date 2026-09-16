# Email Notifications for Care & Academic Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement automated email notifications for academic alerts (Levels 2-4), care logs (`CareLog`), and internal discussion threads (`DiscussionMessage`) to relevant lecturers via Nodemailer and BullMQ (with fallback async), delivering branded HTML cards to Mailhog/SMTP without exposing PII.

**Architecture:** A new `EmailModule` (`apps/api/src/modules/email/`) provides `EmailService`, `EmailProcessor`, and `email-template.helpers.ts`. Email delivery jobs are enqueued to a BullMQ queue (`email-notifications`) with exponential backoff (3 attempts), deduped by `jobId`, and fall back to async execution if Redis is unavailable. Email dispatch hooks cleanly into `NotificationDispatchService` (for Alerts and Discussions) and `CareLogsService` (for Care Logs).

**Tech Stack:** NestJS, TypeScript, Nodemailer, BullMQ, Prisma, Jest.

## Global Constraints

- Project-wide rule: "Không commit khi user chưa yêu cầu."
- RULE 1 (PII Guard): Strictly NO student citizen ID (CCCD), phone number, or private home address in emails.
- Alert Trigger Rules: Skip Level 1 alerts (only in-app bell). Send emails for Level 2 (Medium), Level 3 (High), and Level 4 (Critical).
- Email Availability: Only send to staff with valid non-null email (`Staff.email`). Log warning for staff without email; never throw or interrupt main business flow.
- Non-blocking: Email sending must never block HTTP responses or fail main database transactions.

---

### Task 1: Scaffolding Dependencies and HTML Email Templates

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/email/email-template.helpers.ts`
- Create: `apps/api/src/modules/email/email-template.helpers.spec.ts`

**Interfaces:**
- Consumes: None (pure rendering functions).
- Produces:
  - `renderAlertEmail(data: AlertEmailData): { subject: string; html: string; text: string }`
  - `renderCareLogEmail(data: CareLogEmailData): { subject: string; html: string; text: string }`
  - `renderDiscussionEmail(data: DiscussionEmailData): { subject: string; html: string; text: string }`

- [ ] **Step 1: Install nodemailer and @types/nodemailer**

Run command:
```bash
pnpm --filter @fcare/api add nodemailer
pnpm --filter @fcare/api add -D @types/nodemailer
```

- [ ] **Step 2: Write failing unit test for email template helpers**

Create `apps/api/src/modules/email/email-template.helpers.spec.ts`:
```typescript
import {
  renderAlertEmail,
  renderCareLogEmail,
  renderDiscussionEmail,
} from './email-template.helpers';

describe('email-template.helpers', () => {
  const baseStudent = {
    fullName: 'Nguyễn Văn An',
    studentCode: 'SE170001',
    classCode: 'SE1801',
  };

  describe('renderAlertEmail', () => {
    it('renders Level 2 alert with orange badge and correct CTA link', () => {
      const result = renderAlertEmail({
        student: baseStudent,
        level: 2,
        reason: 'Nghỉ học 3 buổi liên tiếp',
        raisedByName: 'ThS. Trần Văn Minh',
        actionUrl: 'http://localhost:3000/alerts',
      });

      expect(result.subject).toContain('[FCare - Cảnh báo Trung bình]');
      expect(result.subject).toContain('SE170001');
      expect(result.html).toContain('Nguyễn Văn An');
      expect(result.html).toContain('SE170001');
      expect(result.html).toContain('Nghỉ học 3 buổi liên tiếp');
      expect(result.html).toContain('ThS. Trần Văn Minh');
      expect(result.html).toContain('http://localhost:3000/alerts');
      // PII Check
      expect(result.html).not.toMatch(/CCCD|Số CCCD|Số điện thoại/);
    });

    it('renders Level 4 alert with critical red badge', () => {
      const result = renderAlertEmail({
        student: baseStudent,
        level: 4,
        reason: 'Nguy cơ thôi học cao',
        raisedByName: 'Cán bộ CTSV',
        actionUrl: 'http://localhost:3000/alerts',
      });

      expect(result.subject).toContain('[FCare - Cảnh báo Khẩn cấp]');
      expect(result.html).toContain('#DC2626'); // Red color
    });
  });

  describe('renderCareLogEmail', () => {
    it('renders CareLog email with contact details and next plan', () => {
      const result = renderCareLogEmail({
        student: baseStudent,
        contactMethod: 'Trực tiếp',
        notes: 'Đã gặp mặt động viên tinh thần',
        nextPlan: 'Hẹn gặp lại vào tuần sau',
        staffName: 'Cô Bùi Ngọc Lan',
        actionUrl: 'http://localhost:3000/students/student-1',
      });

      expect(result.subject).toContain('[FCare - Nhật ký chăm sóc]');
      expect(result.subject).toContain('Nguyễn Văn An');
      expect(result.html).toContain('Đã gặp mặt động viên tinh thần');
      expect(result.html).toContain('Hẹn gặp lại vào tuần sau');
      expect(result.html).toContain('Cô Bùi Ngọc Lan');
      expect(result.html).toContain('http://localhost:3000/students/student-1');
    });
  });

  describe('renderDiscussionEmail', () => {
    it('renders Discussion email with author name and message preview', () => {
      const result = renderDiscussionEmail({
        student: baseStudent,
        authorName: 'Thầy Đỗ Việt Dũng',
        messagePreview: 'Em An đã nộp bài tập bù chưa các thầy cô?',
        actionUrl: 'http://localhost:3000/students/student-1?tab=discussion',
      });

      expect(result.subject).toContain('[FCare - Trao đổi mới]');
      expect(result.subject).toContain('SE170001');
      expect(result.html).toContain('Thầy Đỗ Việt Dũng');
      expect(result.html).toContain('Em An đã nộp bài tập bù chưa các thầy cô?');
      expect(result.html).toContain('http://localhost:3000/students/student-1?tab=discussion');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
pnpm --filter @fcare/api test src/modules/email/email-template.helpers.spec.ts
```
Expected: FAIL with module/function not found.

- [ ] **Step 4: Implement email-template.helpers.ts**

Create `apps/api/src/modules/email/email-template.helpers.ts`:
```typescript
export interface BaseEmailStudent {
  fullName: string;
  studentCode: string;
  classCode?: string | null;
}

export interface AlertEmailData {
  student: BaseEmailStudent;
  level: number;
  reason: string;
  raisedByName: string;
  actionUrl: string;
}

export interface CareLogEmailData {
  student: BaseEmailStudent;
  contactMethod?: string | null;
  notes: string;
  nextPlan?: string | null;
  staffName: string;
  actionUrl: string;
}

export interface DiscussionEmailData {
  student: BaseEmailStudent;
  authorName: string;
  messagePreview: string;
  actionUrl: string;
}

const LEVEL_LABELS: Record<number, { title: string; color: string; bg: string }> = {
  2: { title: 'Cảnh báo Trung bình', color: '#FFFFFF', bg: '#D97706' },
  3: { title: 'Cảnh báo Cao', color: '#FFFFFF', bg: '#EA580C' },
  4: { title: 'Cảnh báo Khẩn cấp', color: '#FFFFFF', bg: '#DC2626' },
};

function renderLayout(title: string, contentHtml: string, actionUrl: string, actionText = 'Xem chi tiết trên FCare'): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #E2E8F0;">
          <!-- Header -->
          <tr>
            <td style="background-color: #16304E; padding: 20px 24px; text-align: left;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="color: #F37021; font-weight: bold; font-size: 20px; letter-spacing: 0.5px;">FCare</div>
                    <div style="color: #E2E8F0; font-size: 13px; margin-top: 2px;">Hệ thống Chăm sóc & Giám sát Học vụ</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 24px;">
              ${contentHtml}
              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
                <tr>
                  <td align="center">
                    <a href="${actionUrl}" target="_blank" style="display: inline-block; background-color: #F37021; color: #FFFFFF; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      ${actionText}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F1F5F9; padding: 16px 24px; text-align: center; border-top: 1px solid #E2E8F0;">
              <p style="margin: 0; font-size: 12px; color: #64748B; line-height: 1.5;">
                Email tự động từ hệ thống FCare. Vui lòng bảo mật thông tin học vụ sinh viên theo quy định của nhà trường.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderStudentBox(student: BaseEmailStudent): string {
  return `
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 14px 16px; margin-bottom: 20px;">
      <div style="font-size: 13px; color: #64748B; margin-bottom: 4px;">Thông tin sinh viên:</div>
      <div style="font-size: 16px; font-weight: 700; color: #0F172A;">
        ${student.fullName} <span style="color: #64748B; font-weight: 500;">(${student.studentCode})</span>
      </div>
      ${student.classCode ? `<div style="font-size: 13px; color: #475569; margin-top: 4px;">Lớp: <strong>${student.classCode}</strong></div>` : ''}
    </div>
  `;
}

export function renderAlertEmail(data: AlertEmailData) {
  const levelInfo = LEVEL_LABELS[data.level] ?? { title: `Cảnh báo Mức ${data.level}`, color: '#FFF', bg: '#EA580C' };
  const subject = `[FCare - ${levelInfo.title}] ${data.student.fullName} (${data.student.studentCode})`;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="margin-bottom: 16px;">
      <span style="display: inline-block; background-color: ${levelInfo.bg}; color: ${levelInfo.color}; font-size: 12px; font-weight: bold; padding: 4px 10px; border-radius: 4px; text-transform: uppercase;">
        ${levelInfo.title}
      </span>
    </div>
    <div style="background-color: #FFFBEB; border-left: 4px solid ${levelInfo.bg}; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      <div style="font-size: 13px; font-weight: 600; color: #92400E; margin-bottom: 4px;">Lý do cảnh báo:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.reason}</div>
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Người phát cảnh báo: <strong>${data.raisedByName}</strong>
    </div>
  `;

  return {
    subject,
    html: renderLayout(subject, contentHtml, data.actionUrl),
    text: `${subject}\n\nSinh viên: ${data.student.fullName} (${data.student.studentCode})\nLý do: ${data.reason}\nNgười phát: ${data.raisedByName}\nChi tiết: ${data.actionUrl}`,
  };
}

export function renderCareLogEmail(data: CareLogEmailData) {
  const subject = `[FCare - Nhật ký chăm sóc] ${data.student.fullName} (${data.student.studentCode})`;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="background-color: #F0FDF4; border-left: 4px solid #16A34A; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      ${data.contactMethod ? `<div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Hình thức: ${data.contactMethod}</div>` : ''}
      <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Nội dung tiếp xúc:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5; margin-bottom: 8px;">${data.notes}</div>
      ${data.nextPlan ? `
        <div style="font-size: 13px; font-weight: 600; color: #166534; margin-bottom: 4px;">Kế hoạch tiếp theo:</div>
        <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.nextPlan}</div>
      ` : ''}
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Cán bộ ghi nhận: <strong>${data.staffName}</strong>
    </div>
  `;

  return {
    subject,
    html: renderLayout(subject, contentHtml, data.actionUrl),
    text: `${subject}\n\nSinh viên: ${data.student.fullName} (${data.student.studentCode})\nNội dung: ${data.notes}\nKế hoạch: ${data.nextPlan || 'N/A'}\nCán bộ: ${data.staffName}\nChi tiết: ${data.actionUrl}`,
  };
}

export function renderDiscussionEmail(data: DiscussionEmailData) {
  const subject = `[FCare - Trao đổi mới] Về sinh viên ${data.student.fullName} (${data.student.studentCode})`;

  const contentHtml = `
    ${renderStudentBox(data.student)}
    <div style="background-color: #F8FAFC; border-left: 4px solid #0284C7; padding: 12px 16px; margin-bottom: 16px; border-radius: 0 4px 4px 0;">
      <div style="font-size: 13px; font-weight: 600; color: #0369A1; margin-bottom: 4px;">${data.authorName} đã gửi tin nhắn:</div>
      <div style="font-size: 14px; color: #1E293B; line-height: 1.5;">${data.messagePreview}</div>
    </div>
    <div style="font-size: 13px; color: #64748B;">
      Hãy truy cập tab Trao đổi trên hồ sơ sinh viên để phản hồi.
    </div>
  `;

  return {
    subject,
    html: renderLayout(subject, contentHtml, data.actionUrl, 'Xem trao đổi trên FCare'),
    text: `${subject}\n\n${data.authorName}: ${data.messagePreview}\nChi tiết: ${data.actionUrl}`,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm --filter @fcare/api test src/modules/email/email-template.helpers.spec.ts
```
Expected: PASS (all tests green).

---

### Task 2: EmailService Core Implementation & Unit Tests

**Files:**
- Create: `apps/api/src/modules/email/email.service.ts`
- Create: `apps/api/src/modules/email/email.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService`, `PrismaService`, `email-template.helpers`
- Produces:
  - `sendMail(options: { to: string | string[]; subject: string; html: string; text?: string }): Promise<boolean>`
  - `sendAlertEmail(alertId: string, recipientIds: string[]): Promise<boolean>`
  - `sendCareLogEmail(careLogId: string, authorStaffId: string): Promise<boolean>`
  - `sendDiscussionEmail(discussionMessageId: string, recipientIds: string[]): Promise<boolean>`

- [ ] **Step 1: Write failing unit test for EmailService**

Create `apps/api/src/modules/email/email.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let prisma: Partial<PrismaService>;
  let sendMailMock: jest.Mock;

  beforeEach(async () => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });

    prisma = {
      alert: {
        findUnique: jest.fn(),
      } as any,
      careLog: {
        findUnique: jest.fn(),
      } as any,
      discussionMessage: {
        findUnique: jest.fn(),
      } as any,
      staff: {
        findMany: jest.fn(),
      } as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: any) => {
              if (key === 'SMTP_HOST') return 'localhost';
              if (key === 'SMTP_PORT') return 1025;
              if (key === 'SMTP_FROM') return 'fcare-noreply@fpt.edu.vn';
              if (key === 'WEB_BASE_URL') return 'http://localhost:3000';
              return defaultVal;
            }),
          },
        },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    // Inject mock transporter
    (service as any).transporter = { sendMail: sendMailMock };
  });

  it('skips Level 1 alert from sending email', async () => {
    (prisma.alert!.findUnique as jest.Mock).mockResolvedValue({
      id: 'alert-1',
      level: 1,
    });

    const result = await service.sendAlertEmail('alert-1', ['staff-1']);
    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends email for Level 2 alert to staff with valid email', async () => {
    (prisma.alert!.findUnique as jest.Mock).mockResolvedValue({
      id: 'alert-2',
      level: 2,
      reason: 'Vắng 3 buổi',
      student: { fullName: 'Nguyễn Văn A', studentCode: 'SE123456', classCode: 'SE1801' },
      raisedBy: { fullName: 'ThS. Trần Minh' },
    });
    (prisma.staff!.findMany as jest.Mock).mockResolvedValue([
      { id: 'staff-1', email: 'minhtm@fpt.edu.vn', fullName: 'Trần Minh' },
    ]);

    const result = await service.sendAlertEmail('alert-2', ['staff-1']);
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['minhtm@fpt.edu.vn'],
        subject: expect.stringContaining('SE123456'),
      }),
    );
  });

  it('filters out staff without email and does not crash', async () => {
    (prisma.alert!.findUnique as jest.Mock).mockResolvedValue({
      id: 'alert-3',
      level: 3,
      reason: 'Nợ học phí',
      student: { fullName: 'Lê Văn B', studentCode: 'SE654321' },
      raisedBy: { fullName: 'CTSV' },
    });
    (prisma.staff!.findMany as jest.Mock).mockResolvedValue([
      { id: 'staff-no-email', email: null, fullName: 'Cán bộ X' },
    ]);

    const result = await service.sendAlertEmail('alert-3', ['staff-no-email']);
    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends care log email to teaching lecturers except author', async () => {
    (prisma.careLog!.findUnique as jest.Mock).mockResolvedValue({
      id: 'care-1',
      studentId: 'student-1',
      contactMethod: 'Trực tiếp',
      notes: 'Đã tư vấn học vụ',
      nextPlan: 'Theo dõi điểm danh tuần tới',
      student: { id: 'student-1', fullName: 'Lê Văn B', studentCode: 'SE654321' },
      staff: { fullName: 'Thầy C' },
    });
    (prisma.staff!.findMany as jest.Mock).mockResolvedValue([
      { id: 'lecturer-2', email: 'lecturer2@fpt.edu.vn', fullName: 'Thầy D' },
    ]);

    const result = await service.sendCareLogEmail('care-1', 'author-staff-id');
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['lecturer2@fpt.edu.vn'],
        subject: expect.stringContaining('SE654321'),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @fcare/api test src/modules/email/email.service.spec.ts
```
Expected: FAIL (EmailService not implemented).

- [ ] **Step 3: Implement EmailService**

Create `apps/api/src/modules/email/email.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import {
  renderAlertEmail,
  renderCareLogEmail,
  renderDiscussionEmail,
} from './email-template.helpers';

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly defaultFrom: string;
  private readonly webBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = Number(this.config.get<string | number>('SMTP_PORT', 1025));
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.defaultFrom = this.config.get<string>(
      'SMTP_FROM',
      'FCare — Chăm sóc & Giám sát Học vụ <fcare-noreply@fpt.edu.vn>',
    );
    this.webBaseUrl = this.config.get<string>(
      'WEB_BASE_URL',
      this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000'),
    );

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log(`Nodemailer transporter khởi tạo tại ${host}:${port}`);
    } catch (error) {
      this.logger.warn(
        `Không thể khởi tạo SMTP transporter: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async sendMail(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('SMTP transporter chưa sẵn sàng, bỏ qua gửi email.');
      return false;
    }

    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const validRecipients = recipients
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    if (validRecipients.length === 0) {
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: this.defaultFrom,
        to: validRecipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(
        `Đã gửi email thành công tới ${validRecipients.length} người nhận: "${options.subject}"`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Gửi email thất bại tới ${validRecipients.join(', ')}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendAlertEmail(alertId: string, recipientIds: string[]): Promise<boolean> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true, classCode: true } },
        raisedBy: { select: { fullName: true, staffCode: true } },
      },
    });

    if (!alert || alert.level < 2) {
      // Mức 1 chỉ thông báo chuông web, không gửi email
      return false;
    }

    const validEmails = await this.resolveStaffEmails(recipientIds);
    if (validEmails.length === 0) {
      this.logger.debug(`Không có email người nhận hợp lệ cho cảnh báo ${alertId}`);
      return false;
    }

    const emailContent = renderAlertEmail({
      student: alert.student,
      level: alert.level,
      reason: alert.reason,
      raisedByName: alert.raisedBy.fullName,
      actionUrl: `${this.webBaseUrl}/alerts`,
    });

    return this.sendMail({
      to: validEmails,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  async sendCareLogEmail(careLogId: string, authorStaffId: string): Promise<boolean> {
    const careLog = await this.prisma.careLog.findUnique({
      where: { id: careLogId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true, classCode: true } },
        staff: { select: { fullName: true, staffCode: true } },
      },
    });

    if (!careLog) {
      return false;
    }

    // Lấy danh sách giảng viên đang dạy sinh viên này
    const teachingStaff = await this.prisma.staff.findMany({
      where: {
        id: { not: authorStaffId },
        isActive: true,
        email: { not: null },
        classSections: { some: { enrollments: { some: { studentId: careLog.studentId } } } },
      },
      select: { email: true },
    });

    const validEmails = teachingStaff
      .map((s) => s.email?.trim())
      .filter((e): e is string => Boolean(e && e.includes('@')));

    if (validEmails.length === 0) {
      this.logger.debug(`Không có email giảng viên nhận nhật ký chăm sóc ${careLogId}`);
      return false;
    }

    const emailContent = renderCareLogEmail({
      student: careLog.student,
      contactMethod: careLog.contactMethod,
      notes: careLog.notes,
      nextPlan: careLog.nextPlan,
      staffName: careLog.staff.fullName,
      actionUrl: `${this.webBaseUrl}/students/${careLog.studentId}`,
    });

    return this.sendMail({
      to: validEmails,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  async sendDiscussionEmail(discussionMessageId: string, recipientIds: string[]): Promise<boolean> {
    const message = await this.prisma.discussionMessage.findUnique({
      where: { id: discussionMessageId },
      include: {
        student: { select: { id: true, studentCode: true, fullName: true, classCode: true } },
        author: { select: { fullName: true, staffCode: true } },
      },
    });

    if (!message || message.deletedAt) {
      return false;
    }

    const validEmails = await this.resolveStaffEmails(recipientIds);
    if (validEmails.length === 0) {
      return false;
    }

    const preview = message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body;

    const emailContent = renderDiscussionEmail({
      student: message.student,
      authorName: message.author.fullName,
      messagePreview: preview,
      actionUrl: `${this.webBaseUrl}/students/${message.studentId}?tab=discussion`,
    });

    return this.sendMail({
      to: validEmails,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  private async resolveStaffEmails(staffIds: string[]): Promise<string[]> {
    if (staffIds.length === 0) return [];
    const staffList = await this.prisma.staff.findMany({
      where: {
        id: { in: staffIds },
        isActive: true,
        email: { not: null },
      },
      select: { id: true, email: true, fullName: true },
    });

    return staffList
      .map((s) => s.email?.trim())
      .filter((e): e is string => Boolean(e && e.includes('@')));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm --filter @fcare/api test src/modules/email/email.service.spec.ts
```
Expected: PASS.

---

### Task 3: BullMQ Queue & EmailProcessor Implementation

**Files:**
- Create: `apps/api/src/modules/email/email.processor.ts`
- Create: `apps/api/src/modules/email/email.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `EmailService`, `@nestjs/bullmq`
- Produces: `EmailModule` (exports `EmailService` and registers queue `email-notifications`)

- [ ] **Step 1: Write EmailProcessor**

Create `apps/api/src/modules/email/email.processor.ts`:
```typescript
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EmailService } from './email.service';

export const EMAIL_NOTIFICATION_QUEUE = 'email-notifications';

export type EmailJobData =
  | { type: 'alert'; alertId: string; recipientIds: string[] }
  | { type: 'care_log'; careLogId: string; authorStaffId: string }
  | { type: 'discussion'; discussionMessageId: string; recipientIds: string[] };

@Processor(EMAIL_NOTIFICATION_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<{ sent: boolean }> {
    this.logger.debug(`Xử lý email job ${job.id} (loại ${job.data.type}, lần thử ${job.attemptsMade + 1})`);
    let sent = false;

    switch (job.data.type) {
      case 'alert':
        sent = await this.emailService.sendAlertEmail(job.data.alertId, job.data.recipientIds);
        break;
      case 'care_log':
        sent = await this.emailService.sendCareLogEmail(job.data.careLogId, job.data.authorStaffId);
        break;
      case 'discussion':
        sent = await this.emailService.sendDiscussionEmail(
          job.data.discussionMessageId,
          job.data.recipientIds,
        );
        break;
    }

    return { sent };
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error): void {
    this.logger.warn(`Worker email gặp lỗi Redis/queue: ${error.message}`);
  }
}
```

- [ ] **Step 2: Create EmailModule**

Create `apps/api/src/modules/email/email.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailProcessor, EMAIL_NOTIFICATION_QUEUE } from './email.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EMAIL_NOTIFICATION_QUEUE,
    }),
  ],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService, BullModule],
})
export class EmailModule {}
```

- [ ] **Step 3: Register EmailModule in AppModule**

Modify `apps/api/src/app.module.ts` to import `EmailModule`:
```typescript
import { EmailModule } from './modules/email/email.module';
...
@Module({
  imports: [
    ...
    EmailModule,
    ...
  ]
})
```

- [ ] **Step 4: Verify compilation & typecheck**

Run:
```bash
pnpm --filter @fcare/api typecheck
```
Expected: PASS with no TypeScript errors.

---

### Task 4: Hooking Email Dispatch into NotificationDispatchService & CareLogsService

**Files:**
- Modify: `apps/api/src/modules/alerts/notification-dispatch.service.ts`
- Modify: `apps/api/src/modules/care-logs/care-logs.service.ts`
- Modify: `apps/api/src/modules/care-logs/care-logs.module.ts`
- Modify: `apps/api/src/modules/alerts/alerts.module.ts`
- Modify: `apps/api/src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `EmailService`, `Queue<EmailJobData>`
- Produces: Asynchronous email enqueuing upon Alert (Level >= 2), Discussion creation, and CareLog creation.

- [ ] **Step 1: Check impact analysis on existing symbols**
Already executed: `AlertsService` (LOW), `CareLogsService` (LOW), `DiscussionsService` (LOW), `NotificationDispatchService` (MEDIUM).

- [ ] **Step 2: Update NotificationDispatchService to trigger email**

In `apps/api/src/modules/alerts/notification-dispatch.service.ts`:
Inject `EmailService` (or optional Queue):
When `data.source.kind === 'alert'`:
Call `this.emailService.sendAlertEmail(data.source.alertId, normalized.recipientIds)` asynchronously (non-blocking, catch error).
When `data.source.kind === 'discussion'`:
Call `this.emailService.sendDiscussionEmail(data.source.discussionMessageId, normalized.recipientIds)` asynchronously (non-blocking, catch error).

- [ ] **Step 3: Update CareLogsService to trigger care log email**

In `apps/api/src/modules/care-logs/care-logs.service.ts`:
Inject `EmailService`.
In `create(user: AuthUser, dto: CreateCareLogDto)`:
After `this.prisma.careLog.create`:
Call `this.emailService.sendCareLogEmail(careLog.id, user.id)` asynchronously (non-blocking, caught).

- [ ] **Step 4: Update module imports**

Add `EmailModule` to `AlertsModule`, `NotificationsModule`, and `CareLogsModule`.

- [ ] **Step 5: Run unit tests**

Run:
```bash
pnpm --filter @fcare/api test src/modules/alerts/notification-dispatch.service.spec.ts
pnpm --filter @fcare/api test src/modules/care-logs/care-logs.service.spec.ts
```
Expected: PASS.

---

### Task 5: End-to-End Live Verification with Mailhog & Test Alert

**Files:**
- Run automated test script: `apps/api/scripts/test-email-dispatch.ts`
- Check Mailhog API: `http://localhost:8025/api/v2/messages`

- [ ] **Step 1: Write integration verification script**

Create `apps/api/src/modules/email/verify-mailhog.e2e.ts` or run verification using a test script that triggers:
1. An alert with level 3 for a test student.
2. A care log for a test student.
3. Queries Mailhog REST API `http://localhost:8025/api/v2/messages` to verify emails arrived with correct subjects, recipients, and HTML cards.

- [ ] **Step 2: Run verification script**

Run:
```bash
npx tsx -r dotenv/config apps/api/src/modules/email/verify-mailhog.e2e.ts
```
Expected: SUCCESS (Emails received in Mailhog with correct subject and body).

- [ ] **Step 3: Verify no regression across entire test suite**

Run:
```bash
pnpm --filter @fcare/api test
```
Expected: All existing test suites pass.

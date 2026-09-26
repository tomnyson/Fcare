import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailSettingsService } from '../mail-settings/mail-settings.service';
import type { EffectiveMailConfig } from '../mail-settings/mail-settings.types';
import { EmailService } from './email.service';

type MockFn = jest.Mock;

interface PrismaMock {
  alert: { findUnique: MockFn };
  careLog: { findUnique: MockFn };
  discussionMessage: { findUnique: MockFn };
  staff: { findMany: MockFn };
}

const effective: EffectiveMailConfig = {
  host: 'mailhog',
  port: 1025,
  secure: false,
  auth: null,
  fromName: 'FCare',
  fromEmail: 'fcare-noreply@fpt.edu.vn',
  enabled: true,
  source: 'ENV',
  version: 1,
};

const baseMail = { to: 'a@fpt.edu.vn', subject: 's', html: '<p/>' };

describe('EmailService', () => {
  let service: EmailService;
  let prisma: PrismaMock;
  let sendMailMock: MockFn;
  let transportFactory: MockFn;
  let mailSettings: {
    getEffectiveConfig: MockFn;
    formatFrom: MockFn;
  };

  beforeEach(async () => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
    transportFactory = jest.fn(() => ({
      sendMail: sendMailMock,
      verify: jest.fn(),
    }));
    mailSettings = {
      getEffectiveConfig: jest.fn().mockResolvedValue(effective),
      formatFrom: jest.fn(() => '"FCare" <fcare-noreply@fpt.edu.vn>'),
    };

    prisma = {
      alert: { findUnique: jest.fn() },
      careLog: { findUnique: jest.fn() },
      discussionMessage: { findUnique: jest.fn() },
      staff: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) =>
              key === 'WEB_BASE_URL' ? 'http://localhost:3000' : defaultVal,
            ),
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: MailSettingsService, useValue: mailSettings },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    (service as unknown as { transportFactory: MockFn }).transportFactory =
      transportFactory;
  });

  it('NOTIFICATIONS_EXTERNAL_DISABLED=true → chặn mọi mail, không đọc cấu hình', async () => {
    const blocked = new EmailService(
      {
        get: jest.fn((key: string, fallback?: string) =>
          key === 'NOTIFICATIONS_EXTERNAL_DISABLED' ? 'true' : fallback,
        ),
      } as unknown as ConfigService,
      prisma as unknown as PrismaService,
      mailSettings as unknown as MailSettingsService,
    );
    (blocked as unknown as { transportFactory: MockFn }).transportFactory =
      transportFactory;

    await expect(blocked.sendMail(baseMail)).resolves.toBe(false);
    expect(mailSettings.getEffectiveConfig).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('enabled=false → không gửi, trả false', async () => {
    mailSettings.getEffectiveConfig.mockResolvedValueOnce({
      ...effective,
      enabled: false,
    });
    await expect(service.sendMail(baseMail)).resolves.toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('version đổi → tạo transporter mới; cùng version → dùng lại', async () => {
    await service.sendMail(baseMail);
    await service.sendMail(baseMail);
    expect(transportFactory).toHaveBeenCalledTimes(1);
    mailSettings.getEffectiveConfig.mockResolvedValue({
      ...effective,
      version: 2,
    });
    await service.sendMail(baseMail);
    expect(transportFactory).toHaveBeenCalledTimes(2);
  });

  it('dùng from từ cấu hình hiệu lực', async () => {
    await service.sendMail(baseMail);
    expect(mailSettings.formatFrom).toHaveBeenCalledWith(effective);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"FCare" <fcare-noreply@fpt.edu.vn>',
        to: ['a@fpt.edu.vn'],
      }),
    );
  });

  it('skips Level 1 alert from sending email', async () => {
    prisma.alert.findUnique.mockResolvedValue({ id: 'alert-1', level: 1 });

    const result = await service.sendAlertEmail('alert-1', ['staff-1']);
    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends email for Level 2 alert to staff with valid email', async () => {
    prisma.alert.findUnique.mockResolvedValue({
      id: 'alert-2',
      level: 2,
      reason: 'Vắng 3 buổi',
      student: {
        fullName: 'Nguyễn Văn A',
        studentCode: 'SE123456',
        classCode: 'SE1801',
      },
      raisedBy: { fullName: 'ThS. Trần Minh' },
    });
    prisma.staff.findMany.mockResolvedValue([
      { id: 'staff-1', email: 'minhtm@fpt.edu.vn', fullName: 'Trần Minh' },
    ]);

    const result = await service.sendAlertEmail('alert-2', ['staff-1']);
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['minhtm@fpt.edu.vn'],
        subject: expect.stringContaining('SE123456') as string,
      }),
    );
  });

  it('filters out staff without email and does not crash', async () => {
    prisma.alert.findUnique.mockResolvedValue({
      id: 'alert-3',
      level: 3,
      reason: 'Nợ học phí',
      student: { fullName: 'Lê Văn B', studentCode: 'SE654321' },
      raisedBy: { fullName: 'CTSV' },
    });
    prisma.staff.findMany.mockResolvedValue([
      { id: 'staff-no-email', email: null, fullName: 'Cán bộ X' },
    ]);

    const result = await service.sendAlertEmail('alert-3', ['staff-no-email']);
    expect(result).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends care log email to teaching lecturers except author', async () => {
    prisma.careLog.findUnique.mockResolvedValue({
      id: 'care-1',
      studentId: 'student-1',
      channel: 'IN_PERSON',
      content: 'Đã tư vấn học vụ',
      outcome: 'Sinh viên hiểu vấn đề',
      nextAction: 'Theo dõi điểm danh tuần tới',
      student: {
        id: 'student-1',
        fullName: 'Lê Văn B',
        studentCode: 'SE654321',
      },
      staff: { fullName: 'Thầy C' },
    });
    prisma.staff.findMany.mockResolvedValue([
      { id: 'lecturer-2', email: 'lecturer2@fpt.edu.vn', fullName: 'Thầy D' },
    ]);

    const result = await service.sendCareLogEmail('care-1', 'author-staff-id');
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['lecturer2@fpt.edu.vn'],
        subject: expect.stringContaining('SE654321') as string,
      }),
    );
  });

  it('sends discussion email to participants', async () => {
    prisma.discussionMessage.findUnique.mockResolvedValue({
      id: 'msg-1',
      studentId: 'student-1',
      body: 'Xin phép hỏi về tình hình bài tập bù của sinh viên',
      deletedAt: null,
      student: {
        id: 'student-1',
        fullName: 'Lê Văn B',
        studentCode: 'SE654321',
      },
      author: { fullName: 'Cô Lan' },
    });
    prisma.staff.findMany.mockResolvedValue([
      { id: 'staff-1', email: 'lan@fpt.edu.vn', fullName: 'Cô Lan' },
    ]);

    const result = await service.sendDiscussionEmail('msg-1', ['staff-1']);
    expect(result).toBe(true);
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['lan@fpt.edu.vn'],
        subject: expect.stringContaining('SE654321') as string,
      }),
    );
  });
});

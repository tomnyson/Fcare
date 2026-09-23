import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailSettingsService } from '../mail-settings/mail-settings.service';
import type { EffectiveMailConfig } from '../mail-settings/mail-settings.types';
import {
  createMailTransport,
  type MailTransport,
  type MailTransportFactory,
} from '../mail-settings/mail-transport.factory';
import {
  renderAlertEmail,
  renderCareLogEmail,
  renderDiscussionEmail,
} from './email-template.helpers';

interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Gửi mail theo cấu hình hiệu lực của `MailSettingsService` (DB → env fallback).
 * Transporter được cache theo `version`; ADMIN lưu cấu hình mới → version tăng → tạo lại.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly webBaseUrl: string;
  private transportFactory: MailTransportFactory = createMailTransport;
  private cached: { version: number; transport: MailTransport } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mailSettings: MailSettingsService,
  ) {
    this.webBaseUrl =
      this.config.get<string>('WEB_BASE_URL') ??
      this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000');
  }

  private transportFor(config: EffectiveMailConfig): MailTransport {
    if (this.cached?.version === config.version) {
      return this.cached.transport;
    }
    const transport = this.transportFactory(config);
    this.cached = { version: config.version, transport };
    return transport;
  }

  async sendMail(options: SendMailOptions): Promise<boolean> {
    const recipients = (Array.isArray(options.to) ? options.to : [options.to])
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));

    if (recipients.length === 0) {
      return false;
    }

    const config = await this.mailSettings.getEffectiveConfig();
    if (!config.enabled) {
      this.logger.warn('Gửi mail đang TẮT trong cấu hình hệ thống — bỏ qua.');
      return false;
    }

    try {
      await this.transportFor(config).sendMail({
        from: this.mailSettings.formatFrom(config),
        to: recipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      this.logger.log(
        `Đã gửi mail "${options.subject}" tới ${recipients.length} người nhận`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Gửi mail thất bại: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendAlertEmail(
    alertId: string,
    recipientIds: string[],
  ): Promise<boolean> {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
        raisedBy: { select: { fullName: true, staffCode: true } },
      },
    });

    if (!alert || alert.level < 2) {
      // Mức 1 chỉ thông báo chuông web, không gửi email
      return false;
    }

    const validEmails = await this.resolveStaffEmails(recipientIds);
    if (validEmails.length === 0) {
      this.logger.debug(
        `Không có email người nhận hợp lệ cho cảnh báo ${alertId}`,
      );
      return false;
    }

    const emailContent = renderAlertEmail({
      student: alert.student,
      level: alert.level,
      reason: alert.reason,
      raisedByName: alert.raisedBy?.fullName ?? 'Hệ thống (rà soát điểm danh)',
      actionUrl: `${this.webBaseUrl}/alerts`,
    });

    return this.sendMail({
      to: validEmails,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  async sendCareLogEmail(
    careLogId: string,
    authorStaffId: string,
  ): Promise<boolean> {
    const careLog = await this.prisma.careLog.findUnique({
      where: { id: careLogId },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
        staff: { select: { fullName: true, staffCode: true } },
      },
    });

    if (!careLog) {
      return false;
    }

    // Lấy danh sách giảng viên đang dạy sinh viên này (loại trừ người tạo nhật ký nếu là giảng viên)
    const teachingStaff = await this.prisma.staff.findMany({
      where: {
        id: { not: authorStaffId },
        isActive: true,
        email: { not: null },
        classSections: {
          some: { enrollments: { some: { studentId: careLog.studentId } } },
        },
      },
      select: { email: true },
    });

    const validEmails = teachingStaff
      .map((s) => s.email?.trim())
      .filter((e): e is string => Boolean(e && e.includes('@')));

    if (validEmails.length === 0) {
      this.logger.debug(
        `Không có email giảng viên nhận nhật ký chăm sóc ${careLogId}`,
      );
      return false;
    }

    const emailContent = renderCareLogEmail({
      student: careLog.student,
      channel: careLog.channel,
      content: careLog.content,
      outcome: careLog.outcome,
      nextAction: careLog.nextAction,
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

  async sendDiscussionEmail(
    discussionMessageId: string,
    recipientIds: string[],
  ): Promise<boolean> {
    const message = await this.prisma.discussionMessage.findUnique({
      where: { id: discussionMessageId },
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            classCode: true,
          },
        },
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

    const preview =
      message.body.length > 120
        ? `${message.body.slice(0, 117)}...`
        : message.body;

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

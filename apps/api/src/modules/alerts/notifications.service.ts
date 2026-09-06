import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { academicAnalysisOutputSchema } from '../student-analyses/analysis-output';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(staffId: string, unreadOnly: boolean) {
    const notifications = await this.prisma.notification.findMany({
      where: { recipientId: staffId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        alert: {
          select: {
            id: true,
            level: true,
            status: true,
            student: {
              select: { id: true, studentCode: true, fullName: true },
            },
          },
        },
        analysisVersion: {
          select: {
            id: true,
            editedOutput: true,
            aiOriginal: true,
          },
        },
      },
    });
    return notifications.map((notification) => {
      const analysisVersion = notification.analysisVersion;
      const output = academicAnalysisOutputSchema.safeParse(
        analysisVersion?.editedOutput ?? analysisVersion?.aiOriginal,
      );
      return {
        id: notification.id,
        recipientId: notification.recipientId,
        alertId: notification.alertId,
        analysisVersionId: notification.analysisVersionId,
        // Web dựa vào trường này để biết thông báo thuộc luồng trao đổi và làm
        // mới khung hội thoại — nhánh polling 120s là lưới an toàn khi SSE rớt.
        discussionMessageId: notification.discussionMessageId,
        targetUrl: notification.targetUrl,
        title: notification.title,
        body: notification.body,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
        alert: notification.alert,
        analysis: analysisVersion
          ? {
              id: analysisVersion.id,
              riskLevel: output.success ? output.data.riskLevel : null,
            }
          : null,
      };
    });
  }

  async unreadCount(staffId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId: staffId, readAt: null },
    });
    return { count };
  }

  async markRead(staffId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, recipientId: staffId },
      select: { id: true, analysisVersionId: true },
    });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    await this.prisma.$transaction([
      this.prisma.notification.update({
        where: { id: notification.id },
        data: { readAt: new Date() },
      }),
      this.prisma.studentTermAnalysisRecipient.updateMany({
        where: {
          notificationId: notification.id,
          recipientId: staffId,
          openedAt: null,
        },
        data: { openedAt: new Date() },
      }),
    ]);
    return { read: true };
  }

  async markAllRead(staffId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: staffId, readAt: null },
      data: { readAt: new Date() },
    });
    return { read: result.count };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(staffId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
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
      },
    });
  }

  async unreadCount(staffId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId: staffId, readAt: null },
    });
    return { count };
  }

  async markRead(staffId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: staffId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
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

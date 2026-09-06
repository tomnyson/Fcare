import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  it('không trả source snapshot hoặc AI output gốc trong danh sách thông báo', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'notification-1',
        recipientId: 'staff-1',
        alertId: null,
        analysisVersionId: 'version-1',
        targetUrl: '/student-analyses/version-1',
        title: 'Phân tích AI MEDIUM',
        body: 'Cần theo dõi.',
        readAt: null,
        createdAt: new Date('2026-08-24T00:00:00Z'),
        alert: null,
        analysisVersion: {
          id: 'version-1',
          editedOutput: {
            riskLevel: 'MEDIUM',
            summary: 'Nội dung chỉ được xem ở trang chi tiết.',
            strengths: [],
            trends: [],
            riskFactors: [],
            recommendations: ['Theo dõi'],
            notificationSummary: 'Cần theo dõi.',
            dataLimitations: [],
          },
          aiOriginal: { secret: 'raw-model-output' },
        },
      },
    ]);
    const prisma = { notification: { findMany } } as unknown as PrismaService;

    const [result] = await new NotificationsService(prisma).listMine(
      'staff-1',
      false,
    );

    expect(result).toMatchObject({
      id: 'notification-1',
      analysis: { id: 'version-1', riskLevel: 'MEDIUM' },
    });
    expect(result).not.toHaveProperty('analysisVersion');
    expect(JSON.stringify(result)).not.toContain('raw-model-output');
    expect(JSON.stringify(result)).not.toContain('Nội dung chỉ được xem');
  });

  /**
   * LOW-1: web chỉ làm mới luồng trao đổi khi payload có `discussionMessageId`.
   * SSE có trường đó; nếu response REST bỏ sót thì nhánh polling 120s (lưới an
   * toàn khi SSE rớt) làm mới được chuông báo nhưng khung hội thoại đứng im.
   */
  it('trả discussionMessageId để nhánh polling làm mới được luồng trao đổi', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'notification-2',
        recipientId: 'staff-1',
        alertId: null,
        analysisVersionId: null,
        discussionMessageId: 'msg-9',
        targetUrl: '/students/sv-1?tab=discussion',
        title: 'Trao đổi mới về SV HE160123',
        body: 'Giảng viên 1: em này nghỉ nhiều',
        readAt: null,
        createdAt: new Date('2026-09-05T00:00:00Z'),
        alert: null,
        analysisVersion: null,
      },
    ]);
    const prisma = { notification: { findMany } } as unknown as PrismaService;

    const [result] = await new NotificationsService(prisma).listMine(
      'staff-1',
      false,
    );

    expect(result.discussionMessageId).toBe('msg-9');
  });
});

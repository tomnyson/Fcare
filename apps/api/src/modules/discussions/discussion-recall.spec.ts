/* eslint-disable @typescript-eslint/unbound-method */

import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { NotificationsService } from '../alerts/notifications.service';
import { DiscussionsService } from './discussions.service';

/**
 * HIGH-1 — thu hồi phải thu hồi THẬT.
 *
 * `create` chép 120 ký tự đầu nội dung sang `Notification.body`; nếu `remove`
 * chỉ đặt `deletedAt` trên `DiscussionMessage` thì luồng hiện "Tin nhắn đã thu
 * hồi" nhưng người nhận vẫn đọc nguyên câu đó trong chuông báo, vĩnh viễn.
 *
 * Test này đi qua CẢ HAI service thật (chỉ giả lập Prisma + dispatch) vì lỗ
 * hổng nằm đúng ở chỗ nối giữa chúng — mock từng service riêng sẽ không thấy.
 */

const lecturer: AuthUser = {
  id: 'gv-1',
  staffCode: 'GV1',
  fullName: 'Giảng viên 1',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

const SECRET = 'Em X có dấu hiệu trầm cảm nặng, bố mẹ đã ly hôn';
const MESSAGE_ID = 'msg-9';

interface NotificationRow {
  id: string;
  recipientId: string;
  alertId: string | null;
  analysisVersionId: string | null;
  discussionMessageId: string | null;
  targetUrl: string | null;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Kho `Notification` trong bộ nhớ, hành xử như bảng thật ở đúng ba thao tác
 * mà luồng này dùng: dispatch ghi vào, `remove` cập nhật, `listMine` đọc ra.
 */
function createHarness() {
  let rows: readonly NotificationRow[] = [];

  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'sv-1',
        studentCode: 'HE160123',
        fullName: 'Nguyễn A',
      }),
      count: jest.fn().mockResolvedValue(1),
    },
    staff: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'gv-2',
          staffCode: 'GV2',
          fullName: 'Giảng viên 2',
          departmentId: 'dept-se',
          roles: [{ role: { key: 'LECTURER' } }],
        },
      ]),
    },
    discussionMessage: {
      create: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        body: SECRET,
        deletedAt: null,
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
      }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        studentId: 'sv-1',
        authorId: 'gv-1',
        deletedAt: null,
      }),
      update: jest.fn().mockResolvedValue({
        id: MESSAGE_ID,
        body: SECRET,
        deletedAt: new Date('2026-03-01T10:00:05.000Z'),
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
      }),
    },
    discussionRead: {
      findMany: jest.fn().mockResolvedValue([{ staffId: 'gv-2' }]),
    },
    notification: {
      findMany: jest
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            rows.map((row) => ({ ...row, alert: null, analysisVersion: null })),
          ),
        ),
      updateMany: jest
        .fn()
        .mockImplementation(
          (args: {
            where: { discussionMessageId: string };
            data: { body: string };
          }) => {
            const matched = rows.filter(
              (row) =>
                row.discussionMessageId === args.where.discussionMessageId,
            ).length;
            rows = rows.map((row) =>
              row.discussionMessageId === args.where.discussionMessageId
                ? { ...row, body: args.data.body }
                : row,
            );
            return Promise.resolve({ count: matched });
          },
        ),
    },
    $transaction: jest
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
  } as unknown as PrismaService;

  // Bản sao tối giản của NotificationDispatchService: ghi một dòng cho mỗi
  // người nhận, mang theo `discussionMessageId` như bảng thật.
  const dispatch = {
    deliver: jest
      .fn()
      .mockImplementation(
        (data: {
          recipientIds: string[];
          title: string;
          body: string;
          source: { discussionMessageId: string; targetUrl: string };
        }) => {
          rows = [
            ...rows,
            ...data.recipientIds.map((recipientId, index) => ({
              id: `noti-${index}`,
              recipientId,
              alertId: null,
              analysisVersionId: null,
              discussionMessageId: data.source.discussionMessageId,
              targetUrl: data.source.targetUrl,
              title: data.title,
              body: data.body,
              readAt: null,
              createdAt: new Date('2026-03-01T10:00:00.000Z'),
            })),
          ];
          return Promise.resolve(data.recipientIds.length);
        },
      ),
  } as unknown as NotificationDispatchService;

  return { prisma, dispatch };
}

describe('Thu hồi tin trao đổi — nội dung không được sống sót trong chuông báo', () => {
  it('gửi → thu hồi → listMine của người nhận KHÔNG còn nội dung gốc', async () => {
    const { prisma, dispatch } = createHarness();
    const discussions = new DiscussionsService(prisma, dispatch);
    const notifications = new NotificationsService(prisma);

    await discussions.create(lecturer, 'sv-1', { body: SECRET });

    // Tiền đề: trước khi thu hồi, nội dung ĐÃ nằm trong chuông báo của gv-2.
    const before = await notifications.listMine('gv-2', false);
    expect(before).toHaveLength(1);
    expect(before[0].body).toContain(SECRET);

    await discussions.remove(lecturer, MESSAGE_ID);

    const after = await notifications.listMine('gv-2', false);
    // Bản ghi phải CÒN (người nhận vẫn cần thấy là có gì đó đã xảy ra, và
    // trạng thái đã đọc phải nguyên vẹn) — chỉ nội dung bị xoá.
    expect(after).toHaveLength(1);
    expect(after[0].body).toBe('Tin nhắn đã thu hồi');
    expect(JSON.stringify(after)).not.toContain(SECRET);
  });

  /**
   * Bản trước của test này chỉ đếm `$transaction` được gọi 1 lần + soi đối số
   * của `updateMany`. Người thẩm định gỡ `updateMany` RA NGOÀI mảng
   * `$transaction` (`$transaction([update])` rồi `await updateMany` ngay sau)
   * và cả bộ test vẫn xanh. Nên ở đây phải soi CHÍNH cái mảng operations:
   * hai lệnh ghi do service dựng có thật sự nằm trong đó hay không.
   */
  it('xoá mềm VÀ tẩy thông báo cùng nằm TRONG mảng operations của $transaction', async () => {
    const { prisma, dispatch } = createHarness();
    const discussions = new DiscussionsService(prisma, dispatch);

    await discussions.remove(lecturer, MESSAGE_ID);

    const transaction = prisma.$transaction as unknown as jest.Mock;
    const update = prisma.discussionMessage.update as unknown as jest.Mock;
    const updateMany = prisma.notification.updateMany as unknown as jest.Mock;

    expect(transaction).toHaveBeenCalledTimes(1);
    const [operations] = transaction.mock.calls[0] as [unknown];
    expect(Array.isArray(operations)).toBe(true);
    expect(operations as unknown[]).toHaveLength(2);
    // Danh tính, không phải hình dạng: đúng giá trị mà service nhận được từ
    // `update`/`updateMany` phải là phần tử của mảng giao dịch. Lệnh chạy
    // ngoài giao dịch sẽ không có mặt ở đây.
    expect(operations as unknown[]).toContain(update.mock.results[0].value);
    expect(operations as unknown[]).toContain(updateMany.mock.results[0].value);

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [wipeArgs] = updateMany.mock.calls[0] as [unknown];
    expect(wipeArgs).toEqual({
      where: { discussionMessageId: MESSAGE_ID },
      data: { body: 'Tin nhắn đã thu hồi' },
    });
  });

  /**
   * Đột biến `data: { deletedAt } → data: {}` (thu hồi không còn xoá mềm tin)
   * từng đi qua cả bộ test vì mock trả `deletedAt` cứng. Soi đối số truyền
   * vào, đừng tin giá trị mock trả về.
   */
  it('lệnh xoá mềm phải mang deletedAt thật, đúng tin được thu hồi', async () => {
    const { prisma, dispatch } = createHarness();
    const discussions = new DiscussionsService(prisma, dispatch);

    await discussions.remove(lecturer, MESSAGE_ID);

    const [args] = (prisma.discussionMessage.update as unknown as jest.Mock)
      .mock.calls[0] as [{ where: unknown; data: { deletedAt?: unknown } }];
    expect(args.where).toEqual({ id: MESSAGE_ID });
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });
});

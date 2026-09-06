import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { DiscussionsService } from './discussions.service';

/**
 * Hai lỗ rò còn lại trên đường `create`:
 *
 * - MED-B: tin được COMMIT trước khi fan-out (3+N truy vấn). Thu hồi rơi vào
 *   cửa sổ đó thì `remove` không tẩy được dòng `Notification` nào (chưa tồn
 *   tại), rồi `deliver` mới ghi chúng — nguyên văn, và không còn ai tẩy nữa.
 * - LOW-C: `discussionMessage.create` nằm ngoài mọi try/catch, nên
 *   `PrismaClientValidationError` (in cả đối số, kèm `body`) đi thẳng tới
 *   `LoggerErrorInterceptor` và được pino ghi cả `message` lẫn `stack`.
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

const BODY = 'em này nghỉ nhiều buổi liên tiếp';

function prismaForCreate(options: { deletedAt?: Date | null } = {}) {
  return {
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
        id: 'msg-9',
        body: BODY,
        deletedAt: null,
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
        author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
      }),
      findMany: jest.fn().mockResolvedValue([{ authorId: 'gv-2' }]),
      // Trạng thái của tin tại thời điểm SẮP ghi thông báo — khác với giá trị
      // `create` trả về lúc đầu request.
      findUnique: jest
        .fn()
        .mockResolvedValue({ deletedAt: options.deletedAt ?? null }),
    },
    discussionRead: {
      findMany: jest.fn().mockResolvedValue([{ staffId: 'gv-2' }]),
    },
  } as unknown as PrismaService;
}

describe('DiscussionsService.create — MED-B: thu hồi trong lúc fan-out', () => {
  it('tin đã bị thu hồi trước khi kịp ghi thông báo → KHÔNG fan-out', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const prisma = prismaForCreate({
      deletedAt: new Date('2026-03-01T10:00:02.000Z'),
    });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: BODY });

    expect(deliver).not.toHaveBeenCalled();
  });

  it('tin còn nguyên → vẫn fan-out, và trạng thái được đọc LẠI từ DB', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const prisma = prismaForCreate({ deletedAt: null });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: BODY });

    expect(deliver).toHaveBeenCalledTimes(1);
    const [args] = (prisma.discussionMessage.findUnique as jest.Mock).mock
      .calls[0] as [{ where: { id: string }; select: Record<string, boolean> }];
    expect(args.where).toEqual({ id: 'msg-9' });
    expect(args.select).toEqual({ deletedAt: true });
  });

  it('tin biến mất khỏi DB (sinh viên bị xoá) → không fan-out', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const prisma = prismaForCreate();
    (prisma.discussionMessage.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: BODY });

    expect(deliver).not.toHaveBeenCalled();
  });
});

describe('DiscussionsService.create — LOW-C: lỗi ghi tin không được mang nội dung ra log', () => {
  function prismaThatFailsOnCreate() {
    const prisma = prismaForCreate();
    const prismaError = new Error(
      `Invalid \`prisma.discussionMessage.create()\` invocation:\n{ data: { body: "${BODY}" } }`,
    );
    prismaError.name = 'PrismaClientValidationError';
    (prisma.discussionMessage.create as jest.Mock).mockRejectedValue(
      prismaError,
    );
    return prisma;
  }

  it('lỗi Prisma khi ghi tin → ném lỗi ĐÃ LÀM SẠCH (message + stack không có nội dung)', async () => {
    const prisma = prismaThatFailsOnCreate();
    const service = new DiscussionsService(prisma, {
      deliver: jest.fn(),
    } as unknown as NotificationDispatchService);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      const thrown = await service
        .create(lecturer, 'sv-1', { body: BODY })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(thrown).toBeInstanceOf(Error);
      const error = thrown as Error & { cause?: unknown };
      // Lỗi gốc của Prisma in cả đối số gọi hàm; nếu nó (hoặc `cause`/stack
      // của nó) đi tiếp tới LoggerErrorInterceptor thì pino ghi nguyên nội dung.
      expect(error.message).not.toContain(BODY);
      expect(String(error.stack)).not.toContain(BODY);
      expect(JSON.stringify(error.cause ?? null)).not.toContain(BODY);
      const logged = warn.mock.calls.map((call) => String(call[0])).join(' | ');
      expect(logged).not.toContain(BODY);
    } finally {
      warn.mockRestore();
    }
  });

  it('client vẫn nhận đúng 500 + đúng câu chữ như trước (không đổi hợp đồng API)', async () => {
    const prisma = prismaThatFailsOnCreate();
    const service = new DiscussionsService(prisma, {
      deliver: jest.fn(),
    } as unknown as NotificationDispatchService);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      const thrown = await service
        .create(lecturer, 'sv-1', { body: BODY })
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(thrown).toBeInstanceOf(HttpException);
      const error = thrown as HttpException;
      expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      // Đúng câu mà HttpExceptionFilter vẫn trả cho lỗi không xác định.
      expect(error.message).toBe(
        'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.',
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('lỗi ghi tin vẫn được log để chẩn đoán: có tên lỗi, không có nội dung', async () => {
    const prisma = prismaThatFailsOnCreate();
    const service = new DiscussionsService(prisma, {
      deliver: jest.fn(),
    } as unknown as NotificationDispatchService);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      await service.create(lecturer, 'sv-1', { body: BODY }).catch(() => null);

      const logged = warn.mock.calls.map((call) => String(call[0])).join(' | ');
      expect(logged).toContain('PrismaClientValidationError');
      expect(logged).not.toContain(BODY);
    } finally {
      warn.mockRestore();
    }
  });
});

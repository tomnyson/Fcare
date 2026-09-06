/* eslint-disable @typescript-eslint/unbound-method */

import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { DiscussionsService } from './discussions.service';
import { CreateMessageDto } from './dto/discussion.dto';

const lecturer: AuthUser = {
  id: 'gv-1',
  staffCode: 'GV1',
  fullName: 'Giảng viên 1',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

const headOfDept: AuthUser = {
  id: 'tbm-1',
  staffCode: 'TBM1',
  fullName: 'Trưởng bộ môn SE',
  roles: ['HEAD_OF_DEPT'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

/** Fragment mà `studentScope` sinh ra cho một giảng viên — viết tay để test
 * ĐỎ khi ai đó đổi sang `deptFilter` hoặc bỏ hẳn filter. */
function taughtBy(lecturerId: string) {
  return { enrollments: { some: { classSection: { lecturerId } } } };
}

/** Sinh viên ngoài phạm vi → `findFirst` không trả gì. */
function outOfScopePrisma() {
  return {
    student: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn() },
    discussionMessage: { findMany: jest.fn(), create: jest.fn() },
    discussionRead: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    staff: { findMany: jest.fn() },
  } as unknown as PrismaService;
}

const noopDispatch = {
  deliver: jest.fn(),
} as unknown as NotificationDispatchService;

describe('DiscussionsService — RULE 2: ngoài phạm vi trả 404, không bao giờ 403', () => {
  it('đọc luồng của sinh viên ngoài phạm vi → NotFound', async () => {
    const service = new DiscussionsService(outOfScopePrisma(), noopDispatch);
    await expect(service.list(lecturer, 'sv-la', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gửi tin vào luồng ngoài phạm vi → NotFound', async () => {
    const prisma = outOfScopePrisma();
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(
      service.create(lecturer, 'sv-la', { body: 'thử xem' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.discussionMessage.create).not.toHaveBeenCalled();
  });

  it('đánh dấu đã đọc luồng ngoài phạm vi → NotFound', async () => {
    const prisma = outOfScopePrisma();
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(service.markRead(lecturer, 'sv-la')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.discussionRead.upsert).not.toHaveBeenCalled();
  });
});

/**
 * Cửa phạm vi phải là ĐÚNG `studentScope`, không phải `deptFilter`: giảng viên
 * thuần chỉ thấy sinh viên lớp mình đứng lớp, cùng bộ môn mà không dạy thì
 * KHÔNG. Không có test này thì đổi helper vẫn xanh cả suite.
 */
describe('DiscussionsService.requireStudent — where phải mang đúng fragment của studentScope', () => {
  function scopedPrisma() {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      student: { findFirst, count: jest.fn() },
      discussionMessage: { findMany: jest.fn(), create: jest.fn() },
      discussionRead: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      staff: { findMany: jest.fn() },
    } as unknown as PrismaService;
    return { prisma, findFirst };
  }

  it('LECTURER thuần → chỉ lớp học phần mình đứng lớp, KHÔNG lọc theo bộ môn', async () => {
    const { prisma, findFirst } = scopedPrisma();
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(service.list(lecturer, 'sv-la', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const [args] = findFirst.mock.calls[0] as [Prisma.StudentFindFirstArgs];
    expect(args.where).toEqual({
      id: 'sv-la',
      AND: [taughtBy('gv-1')],
    });
    expect(JSON.stringify(args.where)).not.toContain('departmentId');
  });

  it('HEAD_OF_DEPT → OR gồm bộ môn mình và lớp mình đang dạy', async () => {
    const { prisma, findFirst } = scopedPrisma();
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(service.list(headOfDept, 'sv-la', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const [args] = findFirst.mock.calls[0] as [Prisma.StudentFindFirstArgs];
    expect(args.where).toEqual({
      id: 'sv-la',
      AND: [{ OR: [{ departmentId: 'dept-se' }, taughtBy('tbm-1')] }],
    });
  });
});

describe('DiscussionsService.remove — chỉ tác giả được thu hồi', () => {
  function prismaWithMessage(authorId: string) {
    return {
      discussionMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'msg-1',
          studentId: 'sv-1',
          authorId,
          deletedAt: null,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'msg-1',
          body: 'x',
          deletedAt: new Date(),
          createdAt: new Date(),
          author: { id: authorId, staffCode: 'GV1', fullName: 'Giảng viên 1' },
        }),
      },
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sv-1', studentCode: 'HE1' }),
      },
      // HIGH-1: thu hồi phải xoá cả nội dung đã chép sang bảng Notification,
      // trong cùng giao dịch với `deletedAt`.
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((operations: Promise<unknown>[]) =>
          Promise.all(operations),
        ),
    } as unknown as PrismaService;
  }

  it('tin của người khác → Forbidden, không update', async () => {
    const prisma = prismaWithMessage('gv-khac');
    const service = new DiscussionsService(prisma, noopDispatch);
    await expect(service.remove(lecturer, 'msg-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.discussionMessage.update).not.toHaveBeenCalled();
  });

  it('tin của chính mình → đặt deletedAt', async () => {
    const prisma = prismaWithMessage('gv-1');
    const service = new DiscussionsService(prisma, noopDispatch);
    const result = await service.remove(lecturer, 'msg-1');
    expect(result.deletedAt).not.toBeNull();
    // Soi ĐỐI SỐ, không soi giá trị mock trả về: `data: {}` (thu hồi không
    // còn xoá mềm) vẫn cho `result.deletedAt` khác null vì mock trả cứng.
    const [args] = (prisma.discussionMessage.update as jest.Mock).mock
      .calls[0] as [{ data: { deletedAt?: unknown } }];
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  /**
   * LOW-D: `maskRecalled` phải áp cho đường `remove`, không chỉ `list`. Nếu
   * ai đó gỡ lệnh gọi `maskRecalled(updated)` trong `remove`, `result.body`
   * sẽ vẫn là 'x' và test này ĐỎ.
   */
  it('thu hồi thành công → body trả về bị che, deletedAt khác null', async () => {
    const prisma = prismaWithMessage('gv-1');
    const service = new DiscussionsService(prisma, noopDispatch);

    const result = await service.remove(lecturer, 'msg-1');

    expect(result.body).toBeNull();
    expect(result.deletedAt).not.toBeNull();
  });
});

describe('DiscussionsService.list — đường thành công', () => {
  const olderAt = new Date('2026-03-01T09:00:00.000Z');
  const newerAt = new Date('2026-03-01T10:00:00.000Z');
  const lastReadAt = new Date('2026-03-01T08:00:00.000Z');

  function prismaWithThread(rows: unknown[]) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = {
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sv-1', studentCode: 'HE160123' }),
        count: jest.fn(),
      },
      discussionMessage: { findMany },
      discussionRead: {
        findUnique: jest.fn().mockResolvedValue({ lastReadAt }),
      },
    } as unknown as PrismaService;
    return { prisma, findMany };
  }

  it('trả TĂNG DẦN theo thời gian, kèm lastReadAt, truyền đúng before/limit', async () => {
    // Prisma trả giảm dần (cuộn ngược); service phải đảo lại cho UI hội thoại.
    const { prisma, findMany } = prismaWithThread([
      {
        id: 'msg-moi',
        body: 'tin mới',
        deletedAt: null,
        createdAt: newerAt,
        author: { id: 'gv-2', staffCode: 'GV2', fullName: 'Giảng viên 2' },
      },
      {
        id: 'msg-cu',
        body: 'tin cũ',
        deletedAt: null,
        createdAt: olderAt,
        author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
      },
    ]);
    const service = new DiscussionsService(prisma, noopDispatch);

    const result = await service.list(lecturer, 'sv-1', {
      before: '2026-03-01T11:00:00.000Z',
      limit: 2,
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      'msg-cu',
      'msg-moi',
    ]);
    expect(result.lastReadAt).toEqual(lastReadAt);

    const [args] = findMany.mock.calls[0] as [
      Prisma.DiscussionMessageFindManyArgs,
    ];
    expect(args.take).toBe(2);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.where).toEqual({
      studentId: 'sv-1',
      createdAt: { lt: new Date('2026-03-01T11:00:00.000Z') },
    });
  });

  it('không truyền before/limit → không lọc thời gian, dùng mặc định 30', async () => {
    const { prisma, findMany } = prismaWithThread([]);
    const service = new DiscussionsService(prisma, noopDispatch);

    const result = await service.list(lecturer, 'sv-1', {});

    expect(result.messages).toEqual([]);
    const [args] = findMany.mock.calls[0] as [
      Prisma.DiscussionMessageFindManyArgs,
    ];
    expect(args.take).toBe(30);
    expect(args.where).toEqual({ studentId: 'sv-1' });
  });

  it('tin đã thu hồi → body null (thu hồi thật, không chỉ giấu ở tầng render)', async () => {
    const deletedAt = new Date('2026-03-01T10:30:00.000Z');
    const { prisma } = prismaWithThread([
      {
        id: 'msg-thu-hoi',
        body: 'nội dung lỡ tay',
        deletedAt,
        createdAt: newerAt,
        author: { id: 'gv-2', staffCode: 'GV2', fullName: 'Giảng viên 2' },
      },
      {
        id: 'msg-thuong',
        body: 'còn nguyên',
        deletedAt: null,
        createdAt: olderAt,
        author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
      },
    ]);
    const service = new DiscussionsService(prisma, noopDispatch);

    const result = await service.list(lecturer, 'sv-1', {});

    const [normal, recalled] = result.messages;
    expect(recalled.body).toBeNull();
    // Giữ nguyên hình dạng JSON để web vẫn vẽ được dòng "đã thu hồi".
    expect(recalled.deletedAt).toEqual(deletedAt);
    expect(recalled.id).toBe('msg-thu-hoi');
    expect(recalled.author).toEqual({
      id: 'gv-2',
      staffCode: 'GV2',
      fullName: 'Giảng viên 2',
    });
    expect(normal.body).toBe('còn nguyên');
    expect(JSON.stringify(result)).not.toContain('nội dung lỡ tay');
  });
});

describe('DiscussionsService.unreadCount', () => {
  it('chưa mở luồng nào → 0, không đụng tới bảng tin nhắn', async () => {
    const groupBy = jest.fn();
    const prisma = {
      discussionRead: { findMany: jest.fn().mockResolvedValue([]) },
      discussionMessage: { groupBy },
    } as unknown as PrismaService;
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(service.unreadCount(lecturer)).resolves.toEqual({ count: 0 });
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('đếm số LUỒNG có tin mới; tin do chính mình viết không được tính', async () => {
    const readSv1 = new Date('2026-03-01T08:00:00.000Z');
    const readSv2 = new Date('2026-03-02T08:00:00.000Z');
    const groupBy = jest.fn().mockResolvedValue([
      { studentId: 'sv-1', _count: { _all: 3 } },
      { studentId: 'sv-2', _count: { _all: 1 } },
    ]);
    const prisma = {
      discussionRead: {
        findMany: jest.fn().mockResolvedValue([
          { studentId: 'sv-1', lastReadAt: readSv1 },
          { studentId: 'sv-2', lastReadAt: readSv2 },
          { studentId: 'sv-3', lastReadAt: readSv2 },
        ]),
      },
      discussionMessage: { groupBy },
    } as unknown as PrismaService;
    const service = new DiscussionsService(prisma, noopDispatch);

    // 3 luồng đã mở nhưng chỉ 2 luồng có tin mới → đếm theo LUỒNG, không theo tin.
    await expect(service.unreadCount(lecturer)).resolves.toEqual({ count: 2 });

    const [args] = groupBy.mock.calls[0] as [
      Prisma.DiscussionMessageGroupByArgs,
    ];
    expect(args.by).toEqual(['studentId']);
    expect(args.where).toEqual({
      student: { AND: [taughtBy('gv-1')] },
      deletedAt: null,
      authorId: { not: 'gv-1' },
      OR: [
        { studentId: 'sv-1', createdAt: { gt: readSv1 } },
        { studentId: 'sv-2', createdAt: { gt: readSv2 } },
        { studentId: 'sv-3', createdAt: { gt: readSv2 } },
      ],
    });
  });

  /**
   * MED-A: mốc đã đọc có thể còn sót lại của sinh viên đã rớt khỏi phạm vi
   * (GV hết dạy lớp đó). `groupBy` được mô phỏng như DB thật — chỉ trả về
   * luồng khớp CẢ điều kiện `student` lẫn điều kiện tin mới; nếu code bỏ
   * `student: studentScope(user)` ra khỏi `where`, mock không nhận được điều
   * kiện đó nữa và trả về CẢ hai luồng → assertion count bên dưới sẽ ĐỎ.
   */
  it('sinh viên NGOÀI phạm vi có tin mới → KHÔNG được tính vào unreadCount', async () => {
    const readSv1 = new Date('2026-03-01T08:00:00.000Z'); // sv-1: gv-1 đang dạy
    const readSv2 = new Date('2026-03-01T08:00:00.000Z'); // sv-2: gv-1 KHÔNG dạy

    const groupBy = jest
      .fn()
      .mockImplementation((args: Prisma.DiscussionMessageGroupByArgs) => {
        const where = args.where as { student?: unknown };
        const rows = [
          { studentId: 'sv-1', _count: { _all: 1 } },
          { studentId: 'sv-2', _count: { _all: 1 } },
        ];
        if (!where.student) {
          // Không lọc phạm vi → mô phỏng DB lộ hết (đây là bug MED-A).
          return Promise.resolve(rows);
        }
        // Có lọc phạm vi: chỉ sv-1 khớp fragment taughtBy('gv-1') của studentScope.
        expect(where.student).toEqual({ AND: [taughtBy('gv-1')] });
        return Promise.resolve(rows.filter((row) => row.studentId === 'sv-1'));
      });
    const prisma = {
      discussionRead: {
        findMany: jest.fn().mockResolvedValue([
          { studentId: 'sv-1', lastReadAt: readSv1 },
          { studentId: 'sv-2', lastReadAt: readSv2 },
        ]),
      },
      discussionMessage: { groupBy },
    } as unknown as PrismaService;
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(service.unreadCount(lecturer)).resolves.toEqual({ count: 1 });
  });
});

describe('DiscussionsService.create — danh sách người nhận thông báo', () => {
  /** Nhân sự tham gia luồng, kèm vai trò để dựng lại phạm vi của TỪNG người. */
  const staffRows = [
    {
      id: 'gv-2',
      staffCode: 'GV2',
      fullName: 'Giảng viên 2',
      departmentId: 'dept-se',
      roles: [{ role: { key: 'LECTURER' } }],
    },
    {
      id: 'ctsv-1',
      staffCode: 'CTSV1',
      fullName: 'Cán bộ CTSV',
      departmentId: null,
      roles: [{ role: { key: 'SA_OFFICER' } }],
    },
  ];

  function prismaForCreate(options: {
    staff?: unknown[];
    inScopeStaffIds?: string[];
  }) {
    const count = jest
      .fn()
      .mockImplementation((args: { where: Prisma.StudentWhereInput }) => {
        const scope = JSON.stringify(args.where);
        const inScope = (options.inScopeStaffIds ?? []).some((id) =>
          scope.includes(id),
        );
        return Promise.resolve(inScope ? 1 : 0);
      });
    const staffFindMany = jest
      .fn()
      .mockResolvedValue(options.staff ?? staffRows);
    const prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sv-1',
          studentCode: 'HE160123',
          fullName: 'Nguyễn A',
        }),
        count,
      },
      staff: { findMany: staffFindMany },
      discussionMessage: {
        create: jest.fn().mockResolvedValue({
          id: 'msg-9',
          body: 'em này nghỉ nhiều',
          deletedAt: null,
          createdAt: new Date(),
          author: { id: 'gv-1', staffCode: 'GV1', fullName: 'Giảng viên 1' },
        }),
        // gv-1 (chính người gửi) đã bị loại bằng điều kiện where authorId != gv-1
        findMany: jest.fn().mockResolvedValue([{ authorId: 'gv-2' }]),
        // MED-B: trạng thái đọc lại ngay trước khi fan-out (mặc định: tin còn
        // nguyên). Ca "bị thu hồi giữa chừng" nằm ở discussion-fanout.spec.ts.
        findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
      },
      discussionRead: {
        findMany: jest.fn().mockResolvedValue([
          { staffId: 'gv-2' }, // trùng với người đã gửi tin → phải khử trùng
          { staffId: 'ctsv-1' },
        ]),
      },
    } as unknown as PrismaService;
    return { prisma, count, staffFindMany };
  }

  it('gồm người đã gửi tin + người đã đọc luồng, KHÔNG gồm người gửi', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const { prisma } = prismaForCreate({ inScopeStaffIds: ['gv-2'] });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: 'em này nghỉ nhiều' });

    const [payload] = deliver.mock.calls[0] as [
      { recipientIds: string[]; source: { kind: string; targetUrl: string } },
    ];
    expect([...payload.recipientIds].sort()).toEqual(['ctsv-1', 'gv-2']);
    expect(payload.recipientIds).not.toContain('gv-1');
    expect(payload.source.kind).toBe('discussion');
    expect(payload.source.targetUrl).toBe('/students/sv-1?tab=discussion');
  });

  /**
   * RULE 2: người từng tham gia luồng có thể đã RỚT khỏi phạm vi (GV hết dạy
   * lớp có sinh viên đó). Thông báo mang mã SV + 120 ký tự nội dung, nên phải
   * lọc lại theo phạm vi TỪNG người nhận ngay trước khi gửi.
   */
  it('người nhận đã rớt khỏi phạm vi → bị loại khỏi recipientIds', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    // gv-2 không còn dạy lớp nào của sv-1 → count = 0; ctsv-1 là vai trò toàn
    // trường nên luôn trong phạm vi.
    const { prisma, count } = prismaForCreate({ inScopeStaffIds: [] });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: 'em này nghỉ nhiều' });

    const [payload] = deliver.mock.calls[0] as [{ recipientIds: string[] }];
    expect(payload.recipientIds).toEqual(['ctsv-1']);
    expect(payload.recipientIds).not.toContain('gv-2');

    // Kiểm phạm vi phải dùng đúng fragment của studentScope, và vai trò toàn
    // trường thì không tốn truy vấn nào (chống N+1).
    expect(count).toHaveBeenCalledTimes(1);
    const [args] = count.mock.calls[0] as [{ where: Prisma.StudentWhereInput }];
    expect(args.where).toEqual({ id: 'sv-1', AND: [taughtBy('gv-2')] });
  });

  it('mọi người nhận đều ngoài phạm vi → không gửi thông báo nào', async () => {
    const deliver = jest.fn();
    const { prisma } = prismaForCreate({
      staff: [staffRows[0]],
      inScopeStaffIds: [],
    });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: 'em này nghỉ nhiều' });

    expect(deliver).not.toHaveBeenCalled();
  });

  /**
   * `discussionMessage.create` đã commit trước khi gửi thông báo. Nếu để lỗi
   * dispatch nổi lên thành 500, người dùng tưởng gửi hụt và bấm lại → tin trùng.
   */
  it('deliver ném lỗi → tin vẫn được ghi và API không lỗi', async () => {
    const deliver = jest.fn().mockRejectedValue(new Error('redis toang'));
    const { prisma } = prismaForCreate({ inScopeStaffIds: ['gv-2'] });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    const message = await service.create(lecturer, 'sv-1', {
      body: 'em này nghỉ nhiều',
    });

    expect(message.id).toBe('msg-9');
    expect(prisma.discussionMessage.create).toHaveBeenCalled();
    expect(deliver).toHaveBeenCalled();
  });

  /**
   * MED-B: `try` phải bọc cả phần tính người nhận (participantsExcept /
   * recipientsInScope), không chỉ phần `deliver`. Tin đã commit ở
   * `discussionMessage.create` phía trên rồi — nếu `try` co lại về sau các
   * lệnh này, lỗi ở đây sẽ ném thẳng ra ngoài `create` và test này ĐỎ.
   */
  it('participantsExcept ném lỗi (SAU khi tin đã commit) → tin vẫn được ghi, create không lỗi', async () => {
    const deliver = jest.fn();
    const { prisma } = prismaForCreate({ inScopeStaffIds: ['gv-2'] });
    (prisma.discussionMessage.findMany as jest.Mock).mockRejectedValue(
      new Error('db toang'),
    );
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    const message = await service.create(lecturer, 'sv-1', {
      body: 'em này nghỉ nhiều',
    });

    expect(message.id).toBe('msg-9');
    expect(prisma.discussionMessage.create).toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  /**
   * Cùng ý với test trên nhưng ở truy vấn KIA. `participantsExcept` và
   * `recipientsInScope` là hai bước riêng: một bản vá chỉ bọc bước đầu vào
   * `try` vẫn để bước sau ném ra ngoài, và không test nào bắt được. Test này
   * khoá luôn nhánh đó.
   */
  it('recipientsInScope ném lỗi (SAU khi tin đã commit) → tin vẫn được ghi, create không lỗi', async () => {
    const deliver = jest.fn();
    const { prisma } = prismaForCreate({ inScopeStaffIds: ['gv-2'] });
    (prisma.staff.findMany as jest.Mock).mockRejectedValue(
      new Error('db toang'),
    );
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    const message = await service.create(lecturer, 'sv-1', {
      body: 'em này nghỉ nhiều',
    });

    expect(message.id).toBe('msg-9');
    expect(prisma.discussionMessage.create).toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  /**
   * LOW-3: `PrismaClientValidationError.message` in cả đối số gọi hàm, kể cả
   * trường `body` đang mang nội dung người dùng gõ. `PiiGuardInterceptor` chỉ
   * lọc theo TÊN KHOÁ trên response nên không cứu được log — log chỉ được
   * mang tên lỗi + id tin.
   */
  it('deliver ném lỗi → log mang tên lỗi + id tin, KHÔNG vọng lại nội dung', async () => {
    const body = 'em này nghỉ nhiều';
    const prismaError = new Error(
      `Invalid \`prisma.notification.createMany()\` invocation: body: "${body}"`,
    );
    prismaError.name = 'PrismaClientValidationError';
    const deliver = jest.fn().mockRejectedValue(prismaError);
    const { prisma } = prismaForCreate({ inScopeStaffIds: ['gv-2'] });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    try {
      await service.create(lecturer, 'sv-1', { body });

      const logged = warn.mock.calls.map((call) => String(call[0])).join(' | ');
      expect(logged).toContain('PrismaClientValidationError');
      expect(logged).toContain('msg-9');
      expect(logged).not.toContain(body);
    } finally {
      warn.mockRestore();
    }
  });

  /**
   * LOW-C: nhân sự đã nghỉ việc (`isActive: false`) không còn đăng nhập
   * được nữa nên không được nhận Notification kèm mã sinh viên + nội dung
   * trao đổi. `staff.findMany` phải mang điều kiện `isActive: true`.
   */
  it('nhân sự đã nghỉ việc → loại khỏi truy vấn tìm người nhận', async () => {
    const deliver = jest.fn().mockResolvedValue(1);
    const { prisma, staffFindMany } = prismaForCreate({
      inScopeStaffIds: ['gv-2'],
    });
    const service = new DiscussionsService(prisma, {
      deliver,
    } as unknown as NotificationDispatchService);

    await service.create(lecturer, 'sv-1', { body: 'em này nghỉ nhiều' });

    const [args] = staffFindMany.mock.calls[0] as [
      { where: { id: { in: string[] }; isActive?: boolean } },
    ];
    expect(args.where.isActive).toBe(true);
  });

  it('nội dung chứa số điện thoại → chặn trước khi ghi DB', async () => {
    const prisma = {
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sv-1', studentCode: 'HE1' }),
      },
      discussionMessage: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new DiscussionsService(prisma, noopDispatch);

    await expect(
      service.create(lecturer, 'sv-1', { body: 'gọi phụ huynh 0912345678' }),
    ).rejects.toThrow();
    expect(prisma.discussionMessage.create).not.toHaveBeenCalled();
  });
});

describe('CreateMessageDto — body được trim trước khi validate', () => {
  function validate(body: unknown) {
    const dto = plainToInstance(CreateMessageDto, { body });
    return { dto, errors: validateSync(dto) };
  }

  it('chuỗi toàn khoảng trắng → IsNotEmpty chặn (không tạo được tin rỗng)', () => {
    const { errors } = validate('   ');
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isNotEmpty).toBeDefined();
  });

  it('khoảng trắng thừa hai đầu bị cắt', () => {
    const { dto, errors } = validate('  em này nghỉ nhiều  ');
    expect(errors).toHaveLength(0);
    expect(dto.body).toBe('em này nghỉ nhiều');
  });

  it('giá trị không phải chuỗi vẫn để IsString báo lỗi, không nổ ở Transform', () => {
    const { errors } = validate(42);
    expect(errors).toHaveLength(1);
    expect(errors[0].constraints?.isString).toBeDefined();
  });
});

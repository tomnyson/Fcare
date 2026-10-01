import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationDispatchService } from '../alerts/notification-dispatch.service';
import { DiscussionsService } from './discussions.service';

/**
 * Nhắc tên trong trao đổi: `@all` = GV đang dạy SV + người đã tham gia luồng +
 * TBM bộ môn của SV; `@<mã NV>` = một người. Ai cũng phải lọc lại theo phạm vi
 * (RULE 2) — người ngoài phạm vi bị bỏ qua lặng lẽ, không báo lỗi.
 */

const author: AuthUser = {
  id: 'gv-1',
  staffCode: 'gv.a',
  fullName: 'Giảng viên A',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

interface StaffRow {
  id: string;
  staffCode: string;
  fullName: string;
  departmentId: string | null;
  roles: { role: { key: string } }[];
}

const staff = (id: string, code: string, role = 'LECTURER'): StaffRow => ({
  id,
  staffCode: code,
  fullName: `Tên ${code}`,
  departmentId: 'dept-se',
  roles: [{ role: { key: role } }],
});

const DIRECTORY: StaffRow[] = [
  staff('gv-1', 'gv.a'),
  staff('gv-2', 'gv.b'),
  staff('gv-3', 'gv.c'),
  staff('tbm-1', 'tbm.se', 'HEAD_OF_DEPT'),
  staff('gv-out', 'gv.out'),
];

/** gv-out không dạy SV này → ngoài phạm vi. */
const OUT_OF_SCOPE = new Set(['gv-out']);

function buildPrisma(
  options: { participants?: string[]; teaching?: string[] } = {},
) {
  const participants = options.participants ?? [];
  const teaching = options.teaching ?? ['gv-1', 'gv-3'];
  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'sv-1',
        studentCode: 'HE160123',
        fullName: 'Nguyễn A',
        departmentId: 'dept-se',
      }),
      count: jest.fn(),
    },
    staff: {
      findMany: jest
        .fn()
        .mockImplementation((args: { where: Record<string, unknown> }) => {
          const where = args.where as {
            id?: { in: string[] };
            OR?: { staffCode: { equals: string } }[];
            roles?: unknown;
          };
          if (where.id) {
            return Promise.resolve(
              DIRECTORY.filter((row) => where.id?.in.includes(row.id)),
            );
          }
          if (where.OR) {
            const codes = where.OR.map((entry) =>
              entry.staffCode.equals.toLowerCase(),
            );
            return Promise.resolve(
              DIRECTORY.filter((row) => codes.includes(row.staffCode)),
            );
          }
          if (where.roles) {
            return Promise.resolve(
              DIRECTORY.filter((row) => row.id === 'tbm-1'),
            );
          }
          return Promise.resolve([]);
        }),
    },
    classSection: {
      findMany: jest
        .fn()
        .mockResolvedValue(teaching.map((lecturerId) => ({ lecturerId }))),
    },
    discussionMessage: {
      create: jest.fn().mockImplementation((args: { data: { body: string } }) =>
        Promise.resolve({
          id: 'msg-1',
          body: args.data.body,
          deletedAt: null,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          author: { id: 'gv-1', staffCode: 'gv.a', fullName: 'Giảng viên A' },
        }),
      ),
      findMany: jest
        .fn()
        .mockResolvedValue(participants.map((authorId) => ({ authorId }))),
      findUnique: jest.fn().mockResolvedValue({ deletedAt: null }),
    },
    discussionRead: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  // `isStudentInScope` gọi count cho từng người; `studentScope` của GV/TBM
  // mang `lecturerId` của chính người đó → biết đang hỏi cho ai.
  prisma.student.count.mockImplementation((args: { where: unknown }) => {
    const json = JSON.stringify(args.where);
    const hit = DIRECTORY.find((row) =>
      json.includes(`"lecturerId":"${row.id}"`),
    );
    return Promise.resolve(hit && OUT_OF_SCOPE.has(hit.id) ? 0 : 1);
  });
  return prisma as unknown as PrismaService & typeof prisma;
}

function setup(options?: Parameters<typeof buildPrisma>[0]) {
  const prisma = buildPrisma(options);
  const deliver = jest.fn().mockResolvedValue(1);
  const service = new DiscussionsService(prisma, {
    deliver,
  } as unknown as NotificationDispatchService);
  return { prisma, deliver, service };
}

type DeliverArgs = { recipientIds: string[]; title: string; body: string };

function callsOf(deliver: jest.Mock): DeliverArgs[] {
  return (deliver.mock.calls as [DeliverArgs][]).map((call) => call[0]);
}

describe('DiscussionsService.create — nhắc tên', () => {
  it('@mã → người đó nhận thông báo "nhắc đến bạn", không nhận thêm thông báo chung', async () => {
    const { deliver, service } = setup({ participants: ['gv-2'] });

    await service.create(author, 'sv-1', { body: 'nhờ @GV.B xem giúp' });

    const calls = callsOf(deliver);
    const mention = calls.find((call) => call.title.includes('nhắc đến bạn'));
    expect(mention?.recipientIds).toEqual(['gv-2']);
    expect(mention?.title).toBe(
      'Giảng viên A nhắc đến bạn trong trao đổi về SV HE160123',
    );
    const general = calls.find((call) => call.title.startsWith('Trao đổi mới'));
    expect(general).toBeUndefined();
  });

  it('@all → GV đang dạy + người tham gia + TBM, trừ tác giả, không trùng', async () => {
    const { deliver, service } = setup({ participants: ['gv-2', 'gv-3'] });

    await service.create(author, 'sv-1', { body: '@all họp chiều nay' });

    const mention = callsOf(deliver).find((call) =>
      call.title.includes('nhắc đến bạn'),
    );
    expect([...(mention?.recipientIds ?? [])].sort()).toEqual([
      'gv-2',
      'gv-3',
      'tbm-1',
    ]);
  });

  it('nhắc người ngoài phạm vi / mã không tồn tại → bỏ qua lặng lẽ, tin vẫn lưu', async () => {
    const { deliver, service } = setup();

    const saved = await service.create(author, 'sv-1', {
      body: 'cc @gv.out @khong.ton.tai',
    });

    expect(saved.id).toBe('msg-1');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('tự nhắc chính mình không gửi gì', async () => {
    const { deliver, service } = setup();
    await service.create(author, 'sv-1', { body: 'ghi chú @gv.a' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('xem trước trong thông báo bỏ dấu định dạng', async () => {
    const { deliver, service } = setup({ participants: ['gv-2'] });
    await service.create(author, 'sv-1', { body: '**Gấp**: _em nghỉ 3 buổi_' });
    const [general] = callsOf(deliver);
    expect(general?.body).toBe('Giảng viên A: Gấp: em nghỉ 3 buổi');
  });
});

describe('DiscussionsService.mentionables', () => {
  it('trả danh sách người nhắc được — chỉ id, mã, tên; không có tác giả', async () => {
    const { service } = setup({
      participants: ['gv-2'],
      teaching: ['gv-1', 'gv-3', 'gv-out'],
    });

    const rows = await service.mentionables(author, 'sv-1');

    expect(rows.map((row) => row.staffCode)).toEqual([
      'gv.b',
      'gv.c',
      'tbm.se',
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['fullName', 'id', 'staffCode']);
    }
  });

  it('sinh viên ngoài phạm vi → 404 như các API trao đổi khác', async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockResolvedValue(null);
    await expect(service.mentionables(author, 'sv-x')).rejects.toMatchObject({
      status: 404,
    });
  });
});

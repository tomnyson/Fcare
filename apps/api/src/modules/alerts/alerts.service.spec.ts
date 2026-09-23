import type { Queue } from 'bullmq';
import type { AuditService } from '../../audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { AlertsService } from './alerts.service';
import type { EscalationService } from './escalation.service';
import type {
  EscalationJobData,
  NotificationDispatchService,
} from './notification-dispatch.service';

/** Phần `where.student` mà `list` dựng ra từ bộ lọc + phạm vi. */
interface AlertFindManyArgs {
  where: {
    status?: string;
    level?: number;
    source?: string;
    student: {
      AND?: unknown[];
      OR?: unknown[];
      classCode?: string;
      departmentId?: string;
      majorId?: string;
      enrollments?: {
        some: {
          classSectionId?: string;
          classSection: { term?: string; lecturerId?: string };
        };
      };
    };
  };
}

const adminUser: AuthUser = {
  id: 'ad',
  staffCode: 'AD',
  fullName: 'Quản trị',
  roles: ['ADMIN'],
  departmentId: null,
  consented: true,
  mustChangePassword: false,
};
const lecturerUser: AuthUser = {
  id: 'l',
  staffCode: 'GV',
  fullName: 'Giảng viên',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: true,
  mustChangePassword: false,
};

/** Phạm vi của giảng viên: chỉ sinh viên lớp học phần mình đứng lớp (RULE 2). */
const LECTURER_SCOPE = [
  { enrollments: { some: { classSection: { lecturerId: 'l' } } } },
];

describe('AlertsService.list — lọc nhiều tiêu chí', () => {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);

  const prisma = {
    alert: { findMany, count },
    $transaction: (promises: unknown[]) => Promise.all(promises),
  } as unknown as PrismaService;

  const queue = {
    on: jest.fn(),
    add: jest.fn(),
  } as unknown as Queue<EscalationJobData>;

  const service = new AlertsService(
    prisma,
    {} as EscalationService,
    {} as AuditService,
    {} as NotificationDispatchService,
    queue,
  );

  beforeEach(() => jest.clearAllMocks());

  it('lớp và ngành lọc thẳng trên sinh viên', async () => {
    await service.list(adminUser, { classCode: 'SE1901', majorId: 'mj-1' });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.classCode).toBe('SE1901');
    expect(args.where.student.majorId).toBe('mj-1');
  });

  it('lọc theo bộ môn của sinh viên, scope của GV vẫn giữ nguyên', async () => {
    await service.list(lecturerUser, {
      departmentId: 'dept-2',
      openOnly: true,
    });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.departmentId).toBe('dept-2');
    expect(args.where.student.AND).toBeDefined();
  });

  it('kỳ + giảng viên + lớp học phần gộp vào CÙNG một lần đăng ký', async () => {
    await service.list(adminUser, {
      term: 'SU25',
      lecturerId: 'gv-1',
      sectionId: 'cs-1',
    });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.enrollments).toEqual({
      some: {
        classSectionId: 'cs-1',
        classSection: { term: 'SU25', lecturerId: 'gv-1' },
      },
    });
  });

  it('không lọc kỳ/GV/lớp học phần thì không đụng quan hệ enrollments', async () => {
    await service.list(adminUser, { status: undefined, level: 4 });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.enrollments).toBeUndefined();
    expect(args.where.level).toBe(4);
  });

  it('RULE 2: ô tìm kiếm dùng OR nhưng KHÔNG được nuốt mất scope', async () => {
    await service.list(lecturerUser, { search: 'nguyen' });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.AND).toEqual(LECTURER_SCOPE);
    expect(args.where.student.OR).toHaveLength(2);
  });

  it('RULE 2: giảng viên lọc GV/lớp học phần khác vẫn bị giới hạn phạm vi mình', async () => {
    await service.list(lecturerUser, {
      lecturerId: 'gv-khac',
      sectionId: 'cs-khong-day',
    });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.student.AND).toEqual(LECTURER_SCOPE);
  });

  it('openOnly: mọi cảnh báo chưa giải quyết (OPEN + ACKNOWLEDGED), thắng status', async () => {
    await service.list(adminUser, { openOnly: true, status: 'RESOLVED' });
    const [args] = findMany.mock.calls[0] as [AlertFindManyArgs];
    expect(args.where.status).toEqual({ not: 'RESOLVED' });
  });

  it('lọc theo nguồn cảnh báo và kèm lớp học phần phát cảnh báo', async () => {
    await service.list(adminUser, { source: 'AUTO_ATTENDANCE' });
    const [args] = findMany.mock.calls[0] as [
      AlertFindManyArgs & { include: { classSection: unknown } },
    ];
    expect(args.where.source).toBe('AUTO_ATTENDANCE');
    expect(args.include.classSection).toEqual({
      select: { id: true, code: true, subject: { select: { name: true } } },
    });
  });

  it('count dùng đúng where với findMany để tổng số không lệch', async () => {
    await service.list(lecturerUser, { term: 'SU25' });
    const [findArgs] = findMany.mock.calls[0] as [AlertFindManyArgs];
    const [countArgs] = count.mock.calls[0] as [AlertFindManyArgs];
    expect(countArgs.where).toEqual(findArgs.where);
  });
});

/** `data` của lần gọi `prisma.alert.create` đầu tiên. */
function createdData(create: jest.Mock): Record<string, unknown> {
  const [args] = create.mock.calls[0] as [{ data: Record<string, unknown> }];
  return args.data;
}

describe('AlertsService.raise — gắn lớp học phần của nhận xét', () => {
  const student = { id: 'st', fullName: 'SV', studentCode: 'PK1' };
  function setup(section: { id: string; term: string } | null) {
    const create = jest.fn().mockResolvedValue({ id: 'al' });
    const sectionFindFirst = jest.fn().mockResolvedValue(section);
    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(student) },
      classSection: { findFirst: sectionFindFirst },
      alert: { create },
    } as unknown as PrismaService;
    const service = new AlertsService(
      prisma,
      {
        computeRecipientIds: jest.fn().mockResolvedValue([]),
      } as unknown as EscalationService,
      { log: jest.fn() } as unknown as AuditService,
      {} as NotificationDispatchService,
      { on: jest.fn(), add: jest.fn() } as unknown as Queue<EscalationJobData>,
    );
    return { service, create, sectionFindFirst };
  }
  const dto = {
    studentId: 'st',
    level: 2,
    reason: 'Sinh viên học yếu cần theo dõi',
  };

  it('lưu lớp + học kỳ khi sinh viên có học lớp đó', async () => {
    const { service, create, sectionFindFirst } = setup({
      id: 'cs',
      term: 'FA26',
    });
    await service.raise(lecturerUser, { ...dto, classSectionId: 'cs' });
    expect(sectionFindFirst).toHaveBeenCalledWith({
      where: { id: 'cs', enrollments: { some: { studentId: 'st' } } },
      select: { id: true, term: true },
    });
    expect(createdData(create)).toMatchObject({
      classSectionId: 'cs',
      term: 'FA26',
    });
  });

  it('từ chối lớp mà sinh viên không học', async () => {
    const { service, create } = setup(null);
    await expect(
      service.raise(lecturerUser, { ...dto, classSectionId: 'khac' }),
    ).rejects.toThrow('Sinh viên không học lớp học phần này.');
    expect(create).not.toHaveBeenCalled();
  });

  it('không gửi lớp thì giữ như cũ: không truy vấn lớp, không gắn lớp', async () => {
    const { service, create, sectionFindFirst } = setup(null);
    await service.raise(lecturerUser, dto);
    expect(sectionFindFirst).not.toHaveBeenCalled();
    expect(createdData(create)).toMatchObject({
      classSectionId: null,
      term: null,
    });
  });
});

/**
 * ADMIN xoá cảnh báo: cảnh báo + nhật ký chăm sóc gắn cảnh báo + TOÀN BỘ nhận
 * xét và luồng trao đổi của sinh viên đó đi trong CÙNG một transaction; thông
 * báo chết theo cảnh báo bằng FK CASCADE (alert-cascade.spec.ts), bản phân tích
 * AI chỉ mất liên kết. Audit ghi số lượng, không ghi tên sinh viên.
 */
describe('AlertsService.remove / deletionPreview — xoá cảnh báo kèm dữ liệu sinh viên', () => {
  const alert = {
    id: 'al-1',
    studentId: 'st-1',
    level: 3,
    status: 'OPEN',
    source: 'AUTO_ATTENDANCE',
    student: { departmentId: 'dept-se' },
  };

  function setup(found: typeof alert | null = alert) {
    const calls: string[] = [];
    const tracked = (name: string, result: unknown) =>
      jest.fn().mockImplementation(() => {
        calls.push(name);
        return Promise.resolve(result);
      });
    const tx = {
      notification: { count: tracked('notification.count', 4) },
      studentTermAnalysisVersion: {
        count: tracked('analysisVersion.count', 1),
      },
      careLog: { deleteMany: tracked('careLog.deleteMany', { count: 2 }) },
      evaluation: {
        deleteMany: tracked('evaluation.deleteMany', { count: 5 }),
      },
      discussionMessage: {
        deleteMany: tracked('discussionMessage.deleteMany', { count: 7 }),
      },
      discussionRead: {
        deleteMany: tracked('discussionRead.deleteMany', { count: 3 }),
      },
      alert: { deleteMany: tracked('alert.deleteMany', { count: 1 }) },
    };
    const careLogCount = jest.fn().mockResolvedValue(2);
    const evaluationCount = jest.fn().mockResolvedValue(5);
    const prisma = {
      alert: {
        findUnique: jest.fn().mockResolvedValue(found),
        findMany: jest.fn().mockResolvedValue(found ? [found] : []),
      },
      // isStudentInScope của ADMIN không truy vấn; GV thì đếm lớp mình dạy.
      student: { count: jest.fn().mockResolvedValue(0) },
      careLog: { count: careLogCount },
      notification: { count: jest.fn().mockResolvedValue(4) },
      evaluation: { count: evaluationCount },
      discussionMessage: { count: jest.fn().mockResolvedValue(7) },
      studentTermAnalysisVersion: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn(
        (arg: unknown[] | ((client: typeof tx) => Promise<unknown>)) =>
          typeof arg === 'function' ? arg(tx) : Promise.all(arg),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AlertsService(
      prisma,
      {} as EscalationService,
      audit as unknown as AuditService,
      {} as NotificationDispatchService,
      { on: jest.fn(), add: jest.fn() } as unknown as Queue<EscalationJobData>,
    );
    return { service, prisma, tx, audit, calls, careLogCount, evaluationCount };
  }

  it('404 khi cảnh báo không tồn tại — không xoá gì', async () => {
    const { service, tx, audit } = setup(null);
    await expect(service.remove(adminUser, 'al-x')).rejects.toThrow(
      'Không tìm thấy cảnh báo.',
    );
    expect(tx.alert.deleteMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('RULE 2: ngoài phạm vi sinh viên → 403, không xoá gì', async () => {
    const { service, tx } = setup();
    await expect(service.remove(lecturerUser, 'al-1')).rejects.toThrow(
      'Cảnh báo không thuộc phạm vi sinh viên của bạn.',
    );
    expect(tx.alert.deleteMany).not.toHaveBeenCalled();
  });

  it('xoá nhật ký gắn cảnh báo + nhận xét + trao đổi của SV rồi mới xoá cảnh báo, cùng transaction', async () => {
    const { service, tx, calls } = setup();
    const result = await service.remove(adminUser, 'al-1');

    expect(tx.careLog.deleteMany).toHaveBeenCalledWith({
      where: { alertId: { in: ['al-1'] } },
    });
    expect(tx.evaluation.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1'] } },
    });
    expect(tx.discussionMessage.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1'] } },
    });
    expect(tx.discussionRead.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1'] } },
    });
    expect(tx.alert.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['al-1'] } },
    });
    expect(calls.indexOf('alert.deleteMany')).toBe(calls.length - 1);

    expect(result).toEqual({
      id: 'al-1',
      careLogs: 2,
      evaluations: 5,
      discussionMessages: 7,
      notifications: 4,
      analysisVersionsUnlinked: 1,
    });
  });

  it('không tự tay xoá thông báo / bản phân tích — FK lo (Cascade / SetNull)', async () => {
    const { service, tx } = setup();
    await service.remove(adminUser, 'al-1');
    expect(tx.notification).not.toHaveProperty('deleteMany');
    expect(tx.studentTermAnalysisVersion).not.toHaveProperty('deleteMany');
  });

  it('audit ALERT_DELETED sau khi transaction xong, chỉ id + số lượng, không tên SV', async () => {
    const { service, audit, prisma } = setup();
    await service.remove(adminUser, 'al-1');

    expect(audit.log).toHaveBeenCalledTimes(1);
    const [entry] = audit.log.mock.calls[0] as [
      { action: string; entityId: string; metadata: Record<string, unknown> },
    ];
    expect(entry).toMatchObject({
      staffId: 'ad',
      action: 'ALERT_DELETED',
      entity: 'Alert',
      entityId: 'al-1',
    });
    expect(entry.metadata).toMatchObject({
      studentId: 'st-1',
      source: 'AUTO_ATTENDANCE',
      level: 3,
      evaluations: 5,
      discussionMessages: 7,
    });
    expect(JSON.stringify(entry.metadata)).not.toMatch(/fullName|studentCode/);

    const txOrder = (prisma.$transaction as jest.Mock).mock
      .invocationCallOrder[0];
    const auditOrder = audit.log.mock.invocationCallOrder[0];
    expect(auditOrder).toBeGreaterThan(txOrder);
  });

  it('deletionPreview: đếm những gì sẽ mất, đi qua cùng cửa phạm vi', async () => {
    const { service, prisma, careLogCount, evaluationCount } = setup();
    (prisma.alert.findUnique as jest.Mock).mockResolvedValue({
      ...alert,
      student: {
        departmentId: 'dept-se',
        studentCode: 'PK1',
        fullName: 'Sinh viên A',
      },
    });

    await expect(service.deletionPreview(lecturerUser, 'al-1')).rejects.toThrow(
      'Cảnh báo không thuộc phạm vi sinh viên của bạn.',
    );

    const preview = await service.deletionPreview(adminUser, 'al-1');
    expect(preview).toEqual({
      id: 'al-1',
      level: 3,
      status: 'OPEN',
      source: 'AUTO_ATTENDANCE',
      student: { studentCode: 'PK1', fullName: 'Sinh viên A' },
      careLogs: 2,
      notifications: 4,
      evaluations: 5,
      discussionMessages: 7,
      analysisVersionsUnlinked: 1,
    });
    expect(evaluationCount).toHaveBeenCalledWith({
      where: { studentId: 'st-1' },
    });
    expect(careLogCount).toHaveBeenCalledWith({ where: { alertId: 'al-1' } });
  });
});

describe('AlertsService.removeMany / deletionPreviewMany — xoá nhiều cảnh báo một lượt', () => {
  // Hai cảnh báo của CÙNG sinh viên st-1 + một của st-2: nhận xét/trao đổi
  // của st-1 chỉ được đếm và xoá MỘT lần.
  const alerts = [
    {
      id: 'al-1',
      studentId: 'st-1',
      level: 3,
      status: 'OPEN',
      source: 'AUTO_ATTENDANCE',
      student: {
        departmentId: 'dept-se',
        studentCode: 'PK1',
        fullName: 'SV A',
      },
    },
    {
      id: 'al-2',
      studentId: 'st-1',
      level: 2,
      status: 'RESOLVED',
      source: 'MANUAL',
      student: {
        departmentId: 'dept-se',
        studentCode: 'PK1',
        fullName: 'SV A',
      },
    },
    {
      id: 'al-3',
      studentId: 'st-2',
      level: 4,
      status: 'ACKNOWLEDGED',
      source: 'MANUAL',
      student: {
        departmentId: 'dept-se',
        studentCode: 'PK2',
        fullName: 'SV B',
      },
    },
  ];

  function setup(found = alerts) {
    const calls: string[] = [];
    const tracked = (name: string, result: unknown) =>
      jest.fn().mockImplementation(() => {
        calls.push(name);
        return Promise.resolve(result);
      });
    const tx = {
      notification: { count: tracked('notification.count', 9) },
      studentTermAnalysisVersion: {
        count: tracked('analysisVersion.count', 2),
      },
      careLog: { deleteMany: tracked('careLog.deleteMany', { count: 3 }) },
      evaluation: {
        deleteMany: tracked('evaluation.deleteMany', { count: 6 }),
      },
      discussionMessage: {
        deleteMany: tracked('discussionMessage.deleteMany', { count: 8 }),
      },
      discussionRead: {
        deleteMany: tracked('discussionRead.deleteMany', { count: 4 }),
      },
      alert: {
        deleteMany: tracked('alert.deleteMany', { count: found.length }),
      },
    };
    // Giữ tham chiếu riêng để assert mà không tách method khỏi object (unbound-method).
    // Lọc theo `id in [...]` như Prisma thật để test "thiếu id" có nghĩa.
    const alertFindMany = jest.fn(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(found.filter((a) => where.id.in.includes(a.id))),
    );
    const careLogCount = jest.fn().mockResolvedValue(3);
    const evaluationCount = jest.fn().mockResolvedValue(6);
    const transaction = jest.fn(
      (arg: unknown[] | ((client: typeof tx) => Promise<unknown>)) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    );
    const prisma = {
      alert: { findMany: alertFindMany },
      student: { count: jest.fn().mockResolvedValue(0) },
      careLog: { count: careLogCount },
      notification: { count: jest.fn().mockResolvedValue(9) },
      evaluation: { count: evaluationCount },
      discussionMessage: { count: jest.fn().mockResolvedValue(8) },
      studentTermAnalysisVersion: { count: jest.fn().mockResolvedValue(2) },
      $transaction: transaction,
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AlertsService(
      prisma,
      {} as EscalationService,
      audit as unknown as AuditService,
      {} as NotificationDispatchService,
      { on: jest.fn(), add: jest.fn() } as unknown as Queue<EscalationJobData>,
    );
    return {
      service,
      tx,
      audit,
      calls,
      alertFindMany,
      careLogCount,
      evaluationCount,
      transaction,
    };
  }

  it('thiếu bất kỳ id nào → 404 và KHÔNG xoá gì (tất cả hoặc không gì)', async () => {
    const { service, tx, audit } = setup(alerts.slice(0, 2));
    await expect(
      service.removeMany(adminUser, ['al-1', 'al-2', 'al-3']),
    ).rejects.toThrow('Không tìm thấy 1 cảnh báo');
    expect(tx.alert.deleteMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('RULE 2: một cảnh báo ngoài phạm vi → 403, không xoá gì', async () => {
    const { service, tx } = setup();
    await expect(
      service.removeMany(lecturerUser, ['al-1', 'al-3']),
    ).rejects.toThrow('Cảnh báo không thuộc phạm vi sinh viên của bạn.');
    expect(tx.alert.deleteMany).not.toHaveBeenCalled();
  });

  it('id trùng nhau được gộp; nhận xét/trao đổi xoá theo SV DISTINCT, cảnh báo xoá sau cùng', async () => {
    const { service, alertFindMany, transaction, tx, calls } = setup();
    const result = await service.removeMany(adminUser, [
      'al-1',
      'al-2',
      'al-3',
      'al-1',
    ]);

    expect(alertFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['al-1', 'al-2', 'al-3'] } },
      }),
    );
    expect(tx.careLog.deleteMany).toHaveBeenCalledWith({
      where: { alertId: { in: ['al-1', 'al-2', 'al-3'] } },
    });
    expect(tx.evaluation.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1', 'st-2'] } },
    });
    expect(tx.discussionMessage.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1', 'st-2'] } },
    });
    expect(tx.discussionRead.deleteMany).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1', 'st-2'] } },
    });
    expect(tx.alert.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['al-1', 'al-2', 'al-3'] } },
    });
    expect(calls.indexOf('alert.deleteMany')).toBe(calls.length - 1);
    expect(transaction).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      ids: ['al-1', 'al-2', 'al-3'],
      alerts: 3,
      students: 2,
      careLogs: 3,
      evaluations: 6,
      discussionMessages: 8,
      notifications: 9,
      analysisVersionsUnlinked: 2,
    });
  });

  it('audit: một dòng ALERT_DELETED cho MỖI cảnh báo, kèm cỡ lô, không tên SV', async () => {
    const { service, audit } = setup();
    await service.removeMany(adminUser, ['al-1', 'al-2', 'al-3']);

    expect(audit.log).toHaveBeenCalledTimes(3);
    const entries = audit.log.mock.calls.map(
      ([entry]: [{ entityId: string; metadata: Record<string, unknown> }]) =>
        entry,
    );
    expect(entries.map((e) => e.entityId)).toEqual(['al-1', 'al-2', 'al-3']);
    expect(entries[2].metadata).toMatchObject({
      studentId: 'st-2',
      source: 'MANUAL',
      status: 'ACKNOWLEDGED',
      level: 4,
      batchSize: 3,
      evaluations: 6,
    });
    expect(JSON.stringify(entries)).not.toMatch(/fullName|studentCode/);
  });

  it('deletionPreviewMany: tổng hợp theo lô + danh sách từng cảnh báo, cùng cửa phạm vi', async () => {
    const { service, careLogCount, evaluationCount } = setup();
    await expect(
      service.deletionPreviewMany(lecturerUser, ['al-1']),
    ).rejects.toThrow('Cảnh báo không thuộc phạm vi sinh viên của bạn.');

    const preview = await service.deletionPreviewMany(adminUser, [
      'al-3',
      'al-1',
      'al-2',
    ]);
    expect(preview).toEqual({
      alerts: 3,
      students: 2,
      autoAttendance: 1,
      careLogs: 3,
      notifications: 9,
      evaluations: 6,
      discussionMessages: 8,
      analysisVersionsUnlinked: 2,
      items: [
        {
          id: 'al-1',
          level: 3,
          status: 'OPEN',
          source: 'AUTO_ATTENDANCE',
          student: { studentCode: 'PK1', fullName: 'SV A' },
        },
        {
          id: 'al-2',
          level: 2,
          status: 'RESOLVED',
          source: 'MANUAL',
          student: { studentCode: 'PK1', fullName: 'SV A' },
        },
        {
          id: 'al-3',
          level: 4,
          status: 'ACKNOWLEDGED',
          source: 'MANUAL',
          student: { studentCode: 'PK2', fullName: 'SV B' },
        },
      ],
    });
    expect(evaluationCount).toHaveBeenCalledWith({
      where: { studentId: { in: ['st-1', 'st-2'] } },
    });
    expect(careLogCount).toHaveBeenCalledWith({
      where: { alertId: { in: ['al-3', 'al-1', 'al-2'] } },
    });
  });
});

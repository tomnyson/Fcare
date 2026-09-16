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

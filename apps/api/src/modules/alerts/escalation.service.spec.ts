import type { PrismaService } from '../../prisma/prisma.service';
import { EscalationService } from './escalation.service';

interface StaffRolesWhere {
  roles?: { some: { role: { key: { in: string[] } } } };
  classSections?: unknown;
  departmentId?: string;
}

describe('EscalationService — ma trận báo tin theo độ khẩn', () => {
  const RAISER = 'gv-binh';

  function makeService(): EscalationService {
    const prisma = {
      student: {
        findUnique: jest.fn().mockResolvedValue({ departmentId: 'dept-se' }),
      },
      staff: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: { where: StaffRolesWhere }) => {
            if (where.classSections) {
              // Giảng viên đang dạy sinh viên (chỉ dùng ở mức 4)
              return Promise.resolve([{ id: 'gv-chi' }, { id: RAISER }]);
            }
            const keys = where.roles?.some.role.key.in ?? [];
            const byRole: Record<string, string[]> = {
              HEAD_OF_DEPT: ['tbm-se'],
              TRAINING_OFFICER: ['dt-hoa'],
              SA_HEAD: ['ctsv-truong'],
              SA_OFFICER: ['ctsv-lan'],
            };
            const ids = keys.flatMap((key) => byRole[key] ?? []);
            return Promise.resolve(ids.map((id) => ({ id })));
          }),
      },
    };
    return new EscalationService(prisma as unknown as PrismaService);
  }

  it('mức 1: giảng viên tự xử lý — không ai nhận thông báo', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      1,
      RAISER,
    );
    expect(recipients).toEqual([]);
  });

  it('mức 2: chỉ trưởng bộ môn của sinh viên', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      2,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['tbm-se']);
  });

  it('mức 3: trưởng bộ môn + cán bộ đào tạo', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      3,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['dt-hoa', 'tbm-se']);
  });

  it('mức 4: thêm CTSV và mọi giảng viên đang dạy, loại trừ người phát', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      4,
      RAISER,
    );
    expect(recipients.sort()).toEqual([
      'ctsv-lan',
      'ctsv-truong',
      'dt-hoa',
      'gv-chi',
      'tbm-se',
    ]);
    expect(recipients).not.toContain(RAISER);
  });
});

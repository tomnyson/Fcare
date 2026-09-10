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
              // Giảng viên đang dạy sinh viên — có mặt ở mọi cấp độ
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

  it('cấp 1: tất cả giảng viên đang dạy sinh viên', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      1,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['gv-chi']);
  });

  it('cấp 2: thêm cán bộ phòng CTSV', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      2,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['ctsv-lan', 'gv-chi']);
  });

  it('cấp 3: thêm trưởng bộ môn của sinh viên', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      3,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['ctsv-lan', 'gv-chi', 'tbm-se']);
  });

  it('cấp 4: thêm trưởng phòng Đào tạo và trưởng phòng CTSV', async () => {
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
  });

  it('người phát cảnh báo không tự nhận thông báo', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      4,
      'gv-chi',
    );
    expect(recipients).not.toContain('gv-chi');
  });
});

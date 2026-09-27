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
              return Promise.resolve(
                ['gv-chi', RAISER].map((id) => ({ id, fullName: `Tên ${id}` })),
              );
            }
            const keys = where.roles?.some.role.key.in ?? [];
            const byRole: Record<string, string[]> = {
              HEAD_OF_DEPT: ['tbm-se'],
              TRAINING_OFFICER: ['dt-hoa'],
              SA_HEAD: ['ctsv-truong'],
              SA_OFFICER: ['ctsv-lan'],
            };
            const ids = keys.flatMap((key) => byRole[key] ?? []);
            return Promise.resolve(
              ids.map((id) => ({ id, fullName: `Tên ${id}` })),
            );
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

  it('cấp 2: CTSV chưa nhận — CTSV chỉ nhận từ mức 3 (docs/plan-lert.md mục 4)', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      2,
      RAISER,
    );
    expect(recipients.sort()).toEqual(['gv-chi']);
  });

  it('cấp 3: thêm CTSV (cán bộ + trưởng phòng) và trưởng bộ môn của sinh viên', async () => {
    const recipients = await makeService().computeRecipientIds(
      'sv-1',
      3,
      RAISER,
    );
    expect(recipients.sort()).toEqual([
      'ctsv-lan',
      'ctsv-truong',
      'gv-chi',
      'tbm-se',
    ]);
  });

  it('cấp 4: thêm cán bộ Đào tạo', async () => {
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

  it('cảnh báo do hệ thống phát (không có raisedById) → không loại ai', async () => {
    const recipients = await makeService().computeRecipientIds('sv-1', 3);
    expect(recipients.sort()).toEqual([
      'ctsv-lan',
      'ctsv-truong',
      'gv-binh',
      'gv-chi',
      'tbm-se',
    ]);
  });

  describe('previewRecipientGroups — xem trước ai nhận khi chọn mức', () => {
    it('trả 4 nhóm theo ma trận, kèm mức bắt đầu nhận và họ tên', async () => {
      const groups = await makeService().previewRecipientGroups('sv-1', RAISER);
      expect(
        groups.map((g) => ({
          key: g.key,
          minLevel: g.minLevel,
          ids: g.members.map((m) => m.id).sort(),
        })),
      ).toEqual([
        { key: 'TEACHING_LECTURERS', minLevel: 1, ids: ['gv-chi'] },
        {
          key: 'STUDENT_AFFAIRS',
          minLevel: 3,
          ids: ['ctsv-lan', 'ctsv-truong'],
        },
        { key: 'HEAD_OF_DEPT', minLevel: 3, ids: ['tbm-se'] },
        { key: 'TRAINING_OFFICE', minLevel: 4, ids: ['dt-hoa'] },
      ]);
      expect(groups[0].members[0]).toEqual({
        id: 'gv-chi',
        fullName: 'Tên gv-chi',
      });
    });

    it.each([1, 2, 3, 4])(
      'mức %i: gộp các nhóm có minLevel ≤ mức khớp đúng computeRecipientIds',
      async (level) => {
        const service = makeService();
        const groups = await service.previewRecipientGroups('sv-1', RAISER);
        const fromPreview = [
          ...new Set(
            groups
              .filter((g) => g.minLevel <= level)
              .flatMap((g) => g.members.map((m) => m.id)),
          ),
        ].sort();
        const actual = await service.computeRecipientIds('sv-1', level, RAISER);
        expect(fromPreview).toEqual(actual.sort());
      },
    );
  });
});

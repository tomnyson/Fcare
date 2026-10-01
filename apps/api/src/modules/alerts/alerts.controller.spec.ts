/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from '@nestjs/testing';
import { AbilityFactory } from '../../casl/ability.factory';
import {
  CHECK_POLICIES_KEY,
  type PolicyHandler,
} from '../../common/decorators/check-policies.decorator';
import { PIN_PROOF_PURPOSE_KEY } from '../../common/decorators/require-pin-proof.decorator';
import type { AuthUser } from '../../common/types/auth-user';
import { PinService } from '../auth/pin.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import {
  BulkAlertIdsDto,
  RecipientsPreviewQuery,
  ResolveAlertDto,
} from './dto/alert.dto';

const base = { consented: true, mustChangePassword: false };
const admin: AuthUser = {
  ...base,
  id: 'ad',
  staffCode: 'AD',
  fullName: 'Quản trị',
  roles: ['ADMIN'],
  departmentId: null,
};
const headOfDept: AuthUser = {
  ...base,
  id: 'hd',
  staffCode: 'HD',
  fullName: 'Trưởng bộ môn',
  roles: ['HEAD_OF_DEPT'],
  departmentId: 'dept-se',
};
const lecturer: AuthUser = {
  ...base,
  id: 'gv',
  staffCode: 'GV',
  fullName: 'Giảng viên',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
};

/** Chạy toàn bộ policy gắn trên một handler với user cho trước. */
function allowed(handler: keyof AlertsController, user: AuthUser): boolean {
  const policies = Reflect.getMetadata(
    CHECK_POLICIES_KEY,
    AlertsController.prototype[handler],
  ) as PolicyHandler[] | undefined;
  if (!policies?.length) {
    throw new Error(`${handler} không có @CheckPolicies`);
  }
  const ability = new AbilityFactory().createForUser(user);
  return policies.every((policy) => policy(ability));
}

describe('AlertsController — xoá cảnh báo chỉ dành cho ADMIN', () => {
  let controller: AlertsController;
  let service: jest.Mocked<AlertsService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: PinService, useValue: { checkProof: jest.fn() } },
        {
          provide: AlertsService,
          useValue: {
            remove: jest.fn().mockResolvedValue({ id: 'al-1' }),
            deletionPreview: jest.fn().mockResolvedValue({ id: 'al-1' }),
            removeMany: jest.fn().mockResolvedValue({ ids: ['al-1'] }),
            deletionPreviewMany: jest.fn().mockResolvedValue({ alerts: 1 }),
          },
        },
      ],
    }).compile();
    controller = moduleRef.get(AlertsController);
    service = moduleRef.get(AlertsService);
  });

  const destructiveHandlers: Array<keyof AlertsController> = [
    'remove',
    'deletionPreview',
    'removeMany',
    'deletionPreviewMany',
  ];

  it.each(destructiveHandlers)('%s: ADMIN được phép', (handler) => {
    expect(allowed(handler, admin)).toBe(true);
  });

  const blocked: Array<[keyof AlertsController, string, AuthUser]> = [
    ['remove', 'HEAD_OF_DEPT', headOfDept],
    ['remove', 'LECTURER', lecturer],
    ['deletionPreview', 'HEAD_OF_DEPT', headOfDept],
    ['deletionPreview', 'LECTURER', lecturer],
    ['removeMany', 'HEAD_OF_DEPT', headOfDept],
    ['removeMany', 'LECTURER', lecturer],
    ['deletionPreviewMany', 'HEAD_OF_DEPT', headOfDept],
    ['deletionPreviewMany', 'LECTURER', lecturer],
  ];

  it.each(blocked)('%s: %s bị chặn ở policy', (handler, _role, user) => {
    expect(allowed(handler, user)).toBe(false);
  });

  it('resolve mở cho TBM và GV (service kiểm GV có đứng lớp không)', () => {
    expect(allowed('resolve', headOfDept)).toBe(true);
    expect(allowed('resolve', lecturer)).toBe(true);
  });

  it('acknowledge: TBM và GV qua CASL — service chặn GV tự tiếp nhận cảnh báo mình phát', () => {
    expect(allowed('acknowledge', headOfDept)).toBe(true);
    expect(allowed('acknowledge', lecturer)).toBe(true);
  });

  it('xoá (1 hoặc nhiều) đòi bằng chứng PIN ALERT_DELETE — PIN kiểm ở server', () => {
    for (const handler of ['remove', 'removeMany'] as const) {
      expect(
        Reflect.getMetadata(
          PIN_PROOF_PURPOSE_KEY,
          AlertsController.prototype[handler],
        ),
      ).toBe('ALERT_DELETE');
    }
    expect(
      Reflect.getMetadata(
        PIN_PROOF_PURPOSE_KEY,
        AlertsController.prototype.deletionPreview,
      ),
    ).toBeUndefined();
  });

  it('uỷ quyền xuống service với user + id', async () => {
    await controller.remove(admin, 'al-1');
    expect(service.remove).toHaveBeenCalledWith(admin, 'al-1');
    await controller.deletionPreview(admin, 'al-1');
    expect(service.deletionPreview).toHaveBeenCalledWith(admin, 'al-1');
    await controller.removeMany(admin, { ids: ['al-1', 'al-2'] });
    expect(service.removeMany).toHaveBeenCalledWith(admin, ['al-1', 'al-2']);
    await controller.deletionPreviewMany(admin, { ids: ['al-1'] });
    expect(service.deletionPreviewMany).toHaveBeenCalledWith(admin, ['al-1']);
  });
});

describe('BulkAlertIdsDto — danh sách id xoá một lượt', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  async function errorsOf(input: unknown) {
    const dto = plainToInstance(BulkAlertIdsDto, input);
    return validate(dto);
  }

  it('nhận 1..100 UUID', async () => {
    expect(await errorsOf({ ids: [uuid(1)] })).toHaveLength(0);
    expect(
      await errorsOf({
        ids: Array.from({ length: 100 }, (_, i) => uuid(i + 1)),
      }),
    ).toHaveLength(0);
  });

  it('từ chối rỗng, quá 100, không phải UUID, không phải mảng', async () => {
    expect(await errorsOf({ ids: [] })).not.toHaveLength(0);
    expect(
      await errorsOf({
        ids: Array.from({ length: 101 }, (_, i) => uuid(i + 1)),
      }),
    ).not.toHaveLength(0);
    expect(await errorsOf({ ids: ['al-1'] })).not.toHaveLength(0);
    expect(await errorsOf({ ids: uuid(1) })).not.toHaveLength(0);
    expect(await errorsOf({})).not.toHaveLength(0);
  });
});

describe('ResolveAlertDto — bắt buộc chọn kết quả chốt', () => {
  const check = (body: object) =>
    validate(plainToInstance(ResolveAlertDto, body));

  it('nhận kết quả hợp lệ + ghi chú', async () => {
    expect(
      await check({ outcome: 'PASSED', resolutionNote: 'Đã đi học lại.' }),
    ).toHaveLength(0);
  });

  it('thiếu hoặc sai kết quả → lỗi ở outcome', async () => {
    for (const body of [
      { resolutionNote: 'x' },
      { outcome: 'MAYBE', resolutionNote: 'x' },
    ]) {
      const errors = await check(body);
      expect(errors.map((e) => e.property)).toContain('outcome');
    }
  });
});

describe('GET /alerts/recipients-preview — ai nhận theo mức', () => {
  it('ai phát được cảnh báo thì xem được người nhận (GV, TBM)', () => {
    expect(allowed('recipientsPreview', lecturer)).toBe(true);
    expect(allowed('recipientsPreview', headOfDept)).toBe(true);
  });

  it('studentId phải là UUID', async () => {
    const check = (query: object) =>
      validate(plainToInstance(RecipientsPreviewQuery, query));
    expect(
      await check({ studentId: 'e1cdf502-f6db-46e1-91f5-0c0e39fb96da' }),
    ).toHaveLength(0);
    expect(await check({ studentId: 'abc' })).not.toHaveLength(0);
    expect(await check({})).not.toHaveLength(0);
  });
});

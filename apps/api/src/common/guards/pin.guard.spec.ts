/* eslint-disable @typescript-eslint/unbound-method */
import { ForbiddenException, HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { PinService } from '../../modules/auth/pin.service';
import type { AuthUser } from '../types/auth-user';
import { PinGuard, PinProofGuard } from './pin.guard';

interface FakeRequest {
  user?: Partial<AuthUser>;
  cookies?: Record<string, string>;
  headers: Record<string, string>;
}

function makeContext(request: FakeRequest): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  } as unknown as Reflector;
}

function makePins(
  state: { hasPin: boolean; locked: boolean },
  proofOk = false,
) {
  return {
    sessionState: jest.fn().mockResolvedValue(state),
    checkProof: jest.fn().mockReturnValue(proofOk),
  } as unknown as PinService;
}

const user = { id: 'staff-1' };
const request = (): FakeRequest => ({
  user,
  cookies: { fcare_refresh: 'cookie' },
  headers: {},
});

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.catch((e: unknown) => e);
  if (!(error instanceof HttpException)) return undefined;
  return (error.getResponse() as { code?: string }).code;
}

describe('PinGuard — khoá ứng dụng theo phiên', () => {
  it('chưa tạo PIN → 403 PIN_SETUP_REQUIRED', async () => {
    const guard = new PinGuard(
      makeReflector({}),
      makePins({ hasPin: false, locked: false }),
    );
    await expect(
      codeOf(guard.canActivate(makeContext(request()))),
    ).resolves.toBe('PIN_SETUP_REQUIRED');
  });

  it('phiên đang khoá → 403 APP_LOCKED, đọc đúng cookie refresh của phiên', async () => {
    const pins = makePins({ hasPin: true, locked: true });
    const guard = new PinGuard(makeReflector({}), pins);
    await expect(
      codeOf(guard.canActivate(makeContext(request()))),
    ).resolves.toBe('APP_LOCKED');
    expect(pins.sessionState).toHaveBeenCalledWith('staff-1', 'cookie');
  });

  it('có PIN + không khoá → cho qua', async () => {
    const guard = new PinGuard(
      makeReflector({}),
      makePins({ hasPin: true, locked: false }),
    );
    await expect(guard.canActivate(makeContext(request()))).resolves.toBe(true);
  });

  it.each(['isPublic', 'skipConsent', 'skipPin'])(
    'route đánh dấu %s → bỏ qua, không query DB',
    async (key) => {
      const pins = makePins({ hasPin: false, locked: true });
      const guard = new PinGuard(makeReflector({ [key]: true }), pins);
      await expect(guard.canActivate(makeContext(request()))).resolves.toBe(
        true,
      );
      expect(pins.sessionState).not.toHaveBeenCalled();
    },
  );

  it('chưa đăng nhập → để JwtAuthGuard xử lý', async () => {
    const guard = new PinGuard(
      makeReflector({}),
      makePins({ hasPin: false, locked: true }),
    );
    await expect(guard.canActivate(makeContext({ headers: {} }))).resolves.toBe(
      true,
    );
  });
});

describe('PinProofGuard — thao tác phá huỷ cần vừa nhập lại PIN', () => {
  it('route không yêu cầu bằng chứng → cho qua', () => {
    const guard = new PinProofGuard(
      makeReflector({}),
      makePins({ hasPin: true, locked: false }),
    );
    expect(guard.canActivate(makeContext(request()))).toBe(true);
  });

  it('thiếu / sai header X-Pin-Proof → 403 PIN_PROOF_REQUIRED', () => {
    const pins = makePins({ hasPin: true, locked: false }, false);
    const guard = new PinProofGuard(
      makeReflector({ pinProofPurpose: 'BACKUP_RESTORE' }),
      pins,
    );
    try {
      guard.canActivate(
        makeContext({ ...request(), headers: { 'x-pin-proof': 'bad' } }),
      );
      fail('phải ném ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(
        ((error as ForbiddenException).getResponse() as { code: string }).code,
      ).toBe('PIN_PROOF_REQUIRED');
    }
    expect(pins.checkProof).toHaveBeenCalledWith(
      'staff-1',
      'BACKUP_RESTORE',
      'bad',
    );
  });

  it('bằng chứng hợp lệ đúng mục đích → cho qua', () => {
    const guard = new PinProofGuard(
      makeReflector({ pinProofPurpose: 'ALERT_DELETE' }),
      makePins({ hasPin: true, locked: false }, true),
    );
    expect(
      guard.canActivate(
        makeContext({ ...request(), headers: { 'x-pin-proof': 'ok' } }),
      ),
    ).toBe(true);
  });
});

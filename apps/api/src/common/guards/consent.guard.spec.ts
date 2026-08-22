import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthUser } from '../types/auth-user';
import { ConsentGuard } from './consent.guard';

function makeContext(user: Partial<AuthUser> | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(metadata: {
  isPublic?: boolean;
  skipConsent?: boolean;
}): ConsentGuard {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'isPublic') return metadata.isPublic ?? false;
      if (key === 'skipConsent') return metadata.skipConsent ?? false;
      return undefined;
    }),
  } as unknown as Reflector;
  return new ConsentGuard(reflector);
}

const baseUser: AuthUser = {
  id: 'staff-1',
  staffCode: 'gv.test',
  fullName: 'Test',
  roles: ['LECTURER'],
  departmentId: 'dept-se',
  consented: false,
  mustChangePassword: false,
};

describe('ConsentGuard — cam kết bảo mật bắt buộc mỗi lần đăng nhập', () => {
  it('chặn người dùng chưa ký cam kết với mã CONSENT_REQUIRED', () => {
    const guard = makeGuard({});
    try {
      guard.canActivate(makeContext(baseUser));
      fail('phải ném ForbiddenException');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('CONSENT_REQUIRED');
    }
  });

  it('chặn người dùng còn mật khẩu tạm với mã PASSWORD_CHANGE_REQUIRED', () => {
    const guard = makeGuard({});
    try {
      guard.canActivate(makeContext({ ...baseUser, mustChangePassword: true }));
      fail('phải ném ForbiddenException');
    } catch (error) {
      const response = (error as ForbiddenException).getResponse() as {
        code: string;
      };
      expect(response.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('cho qua khi đã ký cam kết', () => {
    const guard = makeGuard({});
    expect(
      guard.canActivate(makeContext({ ...baseUser, consented: true })),
    ).toBe(true);
  });

  it('cho qua route @SkipConsent (luồng consent/đổi mật khẩu)', () => {
    const guard = makeGuard({ skipConsent: true });
    expect(guard.canActivate(makeContext(baseUser))).toBe(true);
  });

  it('cho qua route @Public', () => {
    const guard = makeGuard({ isPublic: true });
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });
});

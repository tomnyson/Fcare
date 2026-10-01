/* eslint-disable @typescript-eslint/unbound-method */
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { PinService } from './pin.service';
import { RecaptchaService } from './recaptcha.service';
import type { SecuritySettingsService } from '../security-settings/security-settings.service';

function setup() {
  const authService = {
    login: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', mustChangePassword: false },
    }),
  } as unknown as jest.Mocked<AuthService>;
  const recaptcha = {
    verifyLogin: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<RecaptchaService>;
  const response = { cookie: jest.fn() } as unknown as Response;
  const pins = {
    sessionState: jest.fn().mockResolvedValue({ hasPin: false, locked: false }),
  } as unknown as jest.Mocked<PinService>;
  const securitySettings = {
    getIdleLockMinutes: jest.fn().mockResolvedValue(10),
  } as unknown as jest.Mocked<SecuritySettingsService>;
  const controller = new AuthController(
    authService,
    recaptcha,
    pins,
    securitySettings,
  );
  return { controller, authService, recaptcha, response, pins };
}

describe('AuthController.login — reCAPTCHA', () => {
  it('xác minh captcha chỉ bằng token — không còn tham số Origin/Host để client khai localhost mà miễn captcha', async () => {
    const { controller, recaptcha, response } = setup();
    // login() không nhận request nữa: không có đường nào đưa header vào quyết định.
    expect(controller.login.length).toBe(2);
    await controller.login(
      { staffCode: 'GV01', password: 'x', recaptchaToken: 'tok' },
      response,
    );
    expect(recaptcha.verifyLogin).toHaveBeenCalledTimes(1);
    expect(recaptcha.verifyLogin).toHaveBeenCalledWith('tok');
  });

  it('captcha chặn → không đụng tới mật khẩu, không đặt cookie', async () => {
    const { controller, authService, recaptcha, response } = setup();
    recaptcha.verifyLogin.mockRejectedValueOnce(
      new Error('RECAPTCHA_REQUIRED'),
    );
    await expect(
      controller.login({ staffCode: 'GV01', password: 'x' }, response),
    ).rejects.toThrow('RECAPTCHA_REQUIRED');
    expect(authService.login).not.toHaveBeenCalled();
    expect(response.cookie).not.toHaveBeenCalled();
  });
});

describe('AuthController.me — trạng thái PIN', () => {
  const user = {
    id: 'u1',
    staffCode: 'GV01',
    fullName: 'GV',
    roles: ['LECTURER' as const],
    departmentId: null,
    consented: true,
    mustChangePassword: false,
  };

  it('trả cờ tạo PIN, trạng thái khoá của phiên và thời gian khoá ADMIN đặt', async () => {
    const { controller, pins } = setup();
    pins.sessionState.mockResolvedValueOnce({ hasPin: true, locked: true });

    const result = await controller.me(user, {
      cookies: { fcare_refresh: 'rt' },
      headers: {},
    });

    expect(pins.sessionState).toHaveBeenCalledWith('u1', 'rt');
    expect(result).toEqual(
      expect.objectContaining({
        requiresPinSetup: false,
        locked: true,
        idleLockMinutes: 10,
      }),
    );
  });

  it('chưa ký cam kết → chưa hỏi PIN (đúng thứ tự: mật khẩu → cam kết → PIN)', async () => {
    const { controller, pins } = setup();
    const result = await controller.me(
      { ...user, consented: false },
      { headers: {} },
    );
    expect(pins.sessionState).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ requiresPinSetup: false, locked: false }),
    );
  });
});

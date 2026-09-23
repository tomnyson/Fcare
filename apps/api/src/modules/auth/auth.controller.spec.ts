/* eslint-disable @typescript-eslint/unbound-method */
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RecaptchaService } from './recaptcha.service';

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
  const controller = new AuthController(authService, recaptcha);
  return { controller, authService, recaptcha, response };
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

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendTestMailDto, UpdateMailSettingsDto } from './mail-settings.dto';

async function errorsOf(cls: new () => object, body: unknown) {
  const errors = await validate(plainToInstance(cls, body));
  return errors.map((e) => e.property);
}

const valid = {
  host: ' smtp.office365.com ',
  port: 587,
  secure: false,
  username: 'a@fpt.edu.vn',
  password: 'x',
  fromName: 'FCare',
  fromEmail: 'a@fpt.edu.vn',
  enabled: true,
};

describe('UpdateMailSettingsDto', () => {
  it('hợp lệ và trim host', async () => {
    const dto = plainToInstance(UpdateMailSettingsDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.host).toBe('smtp.office365.com');
  });
  it('port ngoài 1..65535, host rỗng, fromEmail sai → lỗi', async () => {
    expect(
      await errorsOf(UpdateMailSettingsDto, { ...valid, port: 70000 }),
    ).toContain('port');
    expect(
      await errorsOf(UpdateMailSettingsDto, { ...valid, host: '' }),
    ).toContain('host');
    expect(
      await errorsOf(UpdateMailSettingsDto, {
        ...valid,
        fromEmail: 'khong-phai-email',
      }),
    ).toContain('fromEmail');
  });
  it('username/password/clearPassword là tuỳ chọn', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { username, password, ...rest } = valid;
    expect(await errorsOf(UpdateMailSettingsDto, rest)).toHaveLength(0);
    expect(
      await errorsOf(UpdateMailSettingsDto, { ...rest, clearPassword: true }),
    ).toHaveLength(0);
  });
});

describe('SendTestMailDto', () => {
  it('bắt buộc to là email; draft nested được validate', async () => {
    expect(await errorsOf(SendTestMailDto, { to: 'not-email' })).toContain(
      'to',
    );
    expect(
      await errorsOf(SendTestMailDto, { to: 'a@fpt.edu.vn' }),
    ).toHaveLength(0);
    expect(
      await errorsOf(SendTestMailDto, {
        to: 'a@fpt.edu.vn',
        draft: { ...valid, port: 0 },
      }),
    ).toContain('draft');
  });
});

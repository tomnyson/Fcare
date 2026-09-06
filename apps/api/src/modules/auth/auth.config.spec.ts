import { ConfigService } from '@nestjs/config';
import { getAccessTokenSecret } from './auth.config';

describe('getAccessTokenSecret', () => {
  it('dùng secret đã cấu hình', () => {
    const config = new ConfigService({
      JWT_ACCESS_SECRET: 'configured-secret',
    });
    expect(getAccessTokenSecret(config)).toBe('configured-secret');
  });

  it('từ chối khởi động production nếu thiếu secret', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });
    expect(() => getAccessTokenSecret(config)).toThrow(
      /required in production/,
    );
  });

  it('chỉ dùng fallback trong development', () => {
    const config = new ConfigService({ NODE_ENV: 'development' });
    expect(getAccessTokenSecret(config)).toBe('dev-access-secret-change-me');
  });
});

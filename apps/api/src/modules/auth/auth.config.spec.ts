import { ConfigService } from '@nestjs/config';
import { getAccessTokenSecret, getGoogleOAuthConfig } from './auth.config';

describe('getGoogleOAuthConfig', () => {
  it('returns config only when all values are present', () => {
    const config = new ConfigService({
      GOOGLE_CLIENT_ID: 'client',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'https://example.test/auth/google/callback',
    });
    expect(getGoogleOAuthConfig(config)).toEqual({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://example.test/auth/google/callback',
    });
  });

  it('returns null when OAuth is not configured', () => {
    expect(getGoogleOAuthConfig(new ConfigService())).toBeNull();
  });
});

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

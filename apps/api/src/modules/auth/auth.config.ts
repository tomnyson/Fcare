import type { ConfigService } from '@nestjs/config';

const DEVELOPMENT_ACCESS_SECRET = 'dev-access-secret-change-me';

export function getAccessTokenSecret(config: ConfigService): string {
  const configured = config.get<string>('JWT_ACCESS_SECRET');
  if (configured) {
    return configured;
  }
  const environment = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
  if (environment === 'production') {
    throw new Error('JWT_ACCESS_SECRET is required in production.');
  }
  return DEVELOPMENT_ACCESS_SECRET;
}

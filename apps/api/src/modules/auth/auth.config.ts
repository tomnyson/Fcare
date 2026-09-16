import type { ConfigService } from '@nestjs/config';

const DEVELOPMENT_ACCESS_SECRET = 'dev-access-secret-change-me';

export function getGoogleOAuthConfig(config: ConfigService): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = config.get<string>('GOOGLE_CLIENT_ID');
  const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
  const redirectUri = config.get<string>('GOOGLE_REDIRECT_URI');
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

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

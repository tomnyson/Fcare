import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hoá bí mật cấu hình (mật khẩu SMTP…) bằng AES-256-GCM.
 * Định dạng lưu: `v1:<iv b64>:<authTag b64>:<ciphertext b64>`.
 * Khoá lấy từ env `SETTINGS_ENCRYPTION_KEY` (32 byte, hex 64 ký tự).
 */
type SecretCipherErrorCode = 'KEY_MISSING' | 'BAD_FORMAT' | 'AUTH_FAILED';

export class SecretCipherError extends Error {
  constructor(
    readonly code: SecretCipherErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SecretCipherError';
  }
}

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export function parseEncryptionKey(keyHex: string | undefined): Buffer | null {
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) return null;
  return Buffer.from(keyHex, 'hex');
}

function requireKey(keyHex: string | undefined): Buffer {
  const key = parseEncryptionKey(keyHex);
  if (!key) {
    throw new SecretCipherError(
      'KEY_MISSING',
      'SETTINGS_ENCRYPTION_KEY chưa cấu hình hoặc không phải 32 byte hex.',
    );
  }
  return key;
}

export function encryptSecret(plain: string, keyHex: string): string {
  const key = requireKey(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    data.toString('base64'),
  ].join(':');
}

export function decryptSecret(cipherText: string, keyHex: string): string {
  const key = requireKey(keyHex);
  const parts = cipherText.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new SecretCipherError(
      'BAD_FORMAT',
      'Ciphertext không đúng định dạng v1.',
    );
  }
  const [, ivB64, tagB64, dataB64] = parts;

  // Validate structure before crypto operations
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  if (iv.length !== IV_BYTES || tag.length !== 16 || data.length === 0) {
    throw new SecretCipherError(
      'BAD_FORMAT',
      'Ciphertext corruption: invalid component length.',
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new SecretCipherError(
      'AUTH_FAILED',
      'Không giải mã được — khoá sai hoặc dữ liệu hỏng.',
    );
  }
}

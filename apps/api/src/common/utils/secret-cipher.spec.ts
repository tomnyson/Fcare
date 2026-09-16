import { randomBytes } from 'node:crypto';
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  SecretCipherError,
} from './secret-cipher';

const KEY = randomBytes(32).toString('hex');

describe('secret-cipher', () => {
  it('mã hoá rồi giải mã cho lại bản rõ, mỗi lần mã hoá ra ciphertext khác nhau', () => {
    const a = encryptSecret('m@t-khau-smtp', KEY);
    const b = encryptSecret('m@t-khau-smtp', KEY);
    expect(a).not.toBe(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(decryptSecret(a, KEY)).toBe('m@t-khau-smtp');
    expect(decryptSecret(b, KEY)).toBe('m@t-khau-smtp');
  });

  it('sai khoá → AUTH_FAILED', () => {
    const cipher = encryptSecret('secret', KEY);
    const other = randomBytes(32).toString('hex');
    expect(() => decryptSecret(cipher, other)).toThrow(SecretCipherError);
    try {
      decryptSecret(cipher, other);
    } catch (error) {
      expect((error as SecretCipherError).code).toBe('AUTH_FAILED');
    }
  });

  it('ciphertext sai định dạng → BAD_FORMAT', () => {
    expect(() => decryptSecret('khong-phai-ciphertext', KEY)).toThrow(
      SecretCipherError,
    );
    expect(() => decryptSecret('v9:a:b:c', KEY)).toThrow(SecretCipherError);
  });

  it('parseEncryptionKey: thiếu hoặc không đủ 32 byte → null', () => {
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(parseEncryptionKey('abc')).toBeNull();
    expect(parseEncryptionKey(KEY)?.length).toBe(32);
  });

  it('thiếu khoá khi mã hoá → KEY_MISSING', () => {
    expect(() => encryptSecret('x', '')).toThrow(SecretCipherError);
  });

  it('ciphertext với IV sai độ dài → BAD_FORMAT (không phải AUTH_FAILED)', () => {
    const validCipher = encryptSecret('test', KEY);
    const parts = validCipher.split(':');
    // Replace tag with base64 of 5 bytes (wrong length for GCM tag)
    const shortTag = Buffer.alloc(5).toString('base64');
    const corruptedCipher = `${parts[0]}:${parts[1]}:${shortTag}:${parts[3]}`;
    expect(() => decryptSecret(corruptedCipher, KEY)).toThrow(
      SecretCipherError,
    );
    try {
      decryptSecret(corruptedCipher, KEY);
    } catch (error) {
      expect((error as SecretCipherError).code).toBe('BAD_FORMAT');
    }
  });

  it('ciphertext với data bị thay đổi → AUTH_FAILED', () => {
    const validCipher = encryptSecret('test', KEY);
    const parts = validCipher.split(':');
    // Tamper with data: flip a bit
    const dataBuffer = Buffer.from(parts[3], 'base64');
    dataBuffer[0] ^= 0xff; // Flip all bits in first byte
    const tamperedData = dataBuffer.toString('base64');
    const tamperedCipher = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedData}`;
    expect(() => decryptSecret(tamperedCipher, KEY)).toThrow(SecretCipherError);
    try {
      decryptSecret(tamperedCipher, KEY);
    } catch (error) {
      expect((error as SecretCipherError).code).toBe('AUTH_FAILED');
    }
  });
});

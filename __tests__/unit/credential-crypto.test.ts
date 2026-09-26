// @ts-nocheck
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '../../lib/security/credential-crypto';

const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');

describe('lib/security/credential-crypto', () => {
  const original = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_A;
  });

  afterAll(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  });

  it('round-trips a secret, including unicode', () => {
    const secret = 'APP_USR-1234567890-abcdef-ção-✓';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces a versioned payload that does not contain the plaintext', () => {
    const payload = encryptSecret('super-secret-token');
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload.split(':')).toHaveLength(4);
    expect(payload).not.toContain('super-secret-token');
  });

  it('uses a random IV, so encrypting twice gives different payloads', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const [v, iv, tag, data] = encryptSecret('token').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = flipped[0] ^ 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('rejects a payload encrypted with a different key', () => {
    const payload = encryptSecret('token');
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(payload)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-payload')).toThrow('Formato de segredo criptografado inválido');
    expect(() => decryptSecret('v2:a:b:c')).toThrow('Formato de segredo criptografado inválido');
  });

  it('fails clearly when the key is missing or has the wrong size', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow('CREDENTIALS_ENCRYPTION_KEY não configurada');
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptSecret('x')).toThrow('deve ter 32 bytes');
  });
});

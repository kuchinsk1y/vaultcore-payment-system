import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import '../../config/env';

// AES-256-GCM for secrets that must be recoverable (TOTP shared secrets), unlike passwords/tokens.

function key(): Buffer {
  const configured = process.env.ENCRYPTION_KEY;
  if (configured) {
    const raw = Buffer.from(configured, 'hex');
    if (raw.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
    return raw;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY is required in production');
  }
  // Development fallback derived from the JWT secret, so local setups work without extra configuration
  return createHash('sha256')
    .update(`paycore-encryption:${process.env.JWT_SECRET || 'super-secure-default-secret-key'}`)
    .digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

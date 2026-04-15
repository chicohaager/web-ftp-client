import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

let encryptionKey: Buffer | null = null;

function getKey(): Buffer {
  if (encryptionKey) return encryptionKey;

  const appData = process.env.APP_DATA || path.join(process.cwd(), 'data');
  const envKey = process.env.ENCRYPTION_KEY;

  if (envKey && envKey !== 'auto') {
    // Use installation-specific salt (app data path is unique per install)
    const salt = `web-ftp-client:${path.resolve(appData)}`;
    encryptionKey = crypto.scryptSync(envKey, salt, 32);
    return encryptionKey;
  }

  // Auto-generate and persist a key
  const keyFile = path.join(appData, '.encryption-key');

  if (fs.existsSync(keyFile)) {
    const content = fs.readFileSync(keyFile, 'utf-8').trim();
    if (content.length !== 64) {
      throw new Error('Corrupted encryption key file');
    }
    encryptionKey = Buffer.from(content, 'hex');
  } else {
    fs.mkdirSync(appData, { recursive: true });
    encryptionKey = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, encryptionKey.toString('hex'), { mode: 0o600 });
  }

  return encryptionKey;
}

export function encrypt(text: string): string {
  if (!text) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(data: string): string {
  if (!data) return '';

  const parts = data.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, tagHex, encrypted] = parts;
  if (ivHex.length !== 32 || tagHex.length !== 32) {
    throw new Error('Invalid encrypted data: malformed IV or tag');
  }

  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

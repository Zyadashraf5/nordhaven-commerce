import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const FORMAT_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Authenticated encryption for administrator MFA secrets at rest.
 *
 * Representation: `v1:<iv-base64>:<tag-base64>:<ciphertext-base64>`. A malformed or tampered value
 * fails closed; no error message includes the ciphertext or the plaintext.
 */
export class SecretCipher {
  private readonly key: Buffer;

  public constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error('Encryption key must decode to exactly 32 bytes');
    }
    this.key = key;
  }

  public encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      FORMAT_VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  public decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4) throw new Error('Unsupported ciphertext format');
    const [version, ivText, tagText, dataText] = parts;
    if (version !== FORMAT_VERSION) throw new Error('Unsupported ciphertext format');
    if (ivText === undefined || tagText === undefined || dataText === undefined) {
      throw new Error('Unsupported ciphertext format');
    }
    const iv = Buffer.from(ivText, 'base64');
    const tag = Buffer.from(tagText, 'base64');
    const data = Buffer.from(dataText, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error('Unsupported ciphertext format');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}

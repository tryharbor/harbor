import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { HarborError } from '@harbor/core';
import type { Db } from '../db/client.ts';

/**
 * Encrypted secret storage in the `secrets` table (AES-256-GCM). The key comes from HARBOR_SECRET_KEY: 32 random
 * bytes, base64. Generate one with `openssl rand -base64 32`. Losing the key means reconnecting every channel.
 */
export class SecretStore {
  private readonly key: Buffer;

  constructor(private readonly db: Db, keyBase64: string | undefined) {
    if (!keyBase64) {
      throw new HarborError('INTERNAL_ERROR', 'HARBOR_SECRET_KEY is not set. Generate one with `openssl rand -base64 32` and add it to .env.');
    }
    this.key = Buffer.from(keyBase64, 'base64');
    if (this.key.length !== 32) throw new HarborError('INTERNAL_ERROR', 'HARBOR_SECRET_KEY must be 32 bytes, base64-encoded.');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, ct] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !ct) throw new Error('Unrecognized secret format.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }

  async put<T>(ref: string, value: T): Promise<void> {
    await this.db.query(
      `INSERT INTO secrets (ref, ciphertext) VALUES ($1, $2)
       ON CONFLICT (ref) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
      [ref, this.encrypt(JSON.stringify(value))],
    );
  }

  async get<T>(ref: string): Promise<T | undefined> {
    const [row] = await this.db.query<{ ciphertext: string }>('SELECT ciphertext FROM secrets WHERE ref = $1', [ref]);
    return row ? (JSON.parse(this.decrypt(row.ciphertext)) as T) : undefined;
  }

  async delete(ref: string): Promise<void> {
    await this.db.query('DELETE FROM secrets WHERE ref = $1', [ref]);
  }
}

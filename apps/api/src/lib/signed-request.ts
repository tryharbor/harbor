import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta's `signed_request`: `<base64url HMAC-SHA256 of the payload>.<base64url JSON payload>`, signed with the app
 * secret. Returns the payload when the signature matches one of `secrets`, else undefined.
 */
export function parseSignedRequest(signed: string, secrets: string[]): Record<string, unknown> | undefined {
  const [sig, payload, extra] = signed.split('.');
  if (!sig || !payload || extra !== undefined) return undefined;
  const given = Buffer.from(sig, 'base64url');
  const valid = secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(payload).digest();
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!valid) return undefined;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
    const record = data as Record<string, unknown>;
    return String(record.algorithm ?? '').toUpperCase() === 'HMAC-SHA256' ? record : undefined;
  } catch {
    return undefined;
  }
}

/** Sign a payload the way Meta does (tests, and checking a callback by hand). */
export function createSignedRequest(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', issued_at: Math.floor(Date.now() / 1000), ...payload })).toString('base64url');
  return `${createHmac('sha256', secret).update(body).digest('base64url')}.${body}`;
}

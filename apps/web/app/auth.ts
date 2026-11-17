import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Signing in (docs/design/deploy-and-auth.md). On when GITHUB_CLIENT_ID is set: GitHub sign-in, limited to the
 * logins in HARBOR_ALLOWED_GITHUB_USERS. Off (the app is open) in local development and simple self-hosting.
 * Server only: proxy.ts, route handlers and api.ts use it.
 */
export const SESSION_COOKIE = 'harbor-session';
export const STATE_COOKIE = 'harbor-oauth-state';
const SESSION_DAYS = 30;

export const authEnabled = () => !!process.env.GITHUB_CLIENT_ID;

export interface Session { login: string; exp: number }

const secret = () => {
  const s = process.env.HARBOR_SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('HARBOR_SESSION_SECRET must be set (32+ characters) when GITHUB_CLIENT_ID is set.');
  return s;
};
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function allowedLogins(): string[] {
  return (process.env.HARBOR_ALLOWED_GITHUB_USERS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export const isAllowed = (login: string) => allowedLogins().includes(login.toLowerCase());

/** `<base64url payload>.<base64url HMAC>`; the payload is `{login, exp}` (exp in ms). */
export function createSessionValue(login: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ login, exp: now + SESSION_DAYS * 86_400_000 } satisfies Session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** The session in a cookie value, if the signature holds, it hasn't expired and the login is still allowed. */
export function readSessionValue(value: string | undefined, now = Date.now()): Session | null {
  if (!value) return null;
  const [payload, mac] = value.split('.');
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (typeof s.login !== 'string' || typeof s.exp !== 'number' || s.exp <= now) return null;
    // Removing someone from the allowlist signs them out on their next request.
    return isAllowed(s.login) ? s : null;
  } catch {
    return null;
  }
}

/** Secure cookies need https; a self-hosted Harbor on plain http (a LAN address) still has to work. */
export const secureCookies = () => (process.env.HARBOR_WEB_URL ?? '').startsWith('https://');

export const sessionCookieOptions = () => ({
  httpOnly: true,
  secure: secureCookies(),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 86_400,
});

export const newState = () => randomBytes(24).toString('base64url');

/** The signed-in person, or null. With sign-in off, everyone counts as signed in. */
/**
 * A capability to view one Full app project's preview: `<projectId>.<exp>.<sig>`, valid for 6 hours. The preview runs in
 * a sandboxed (unique) origin, so its requests carry no Harbor cookie; the token in the path is what lets it load its own
 * files, and only that project's. With sign-in off the app is open anyway, so a fixed local key signs it.
 */
const PREVIEW_HOURS = 6;
const previewSign = (payload: string) => createHmac('sha256', authEnabled() ? secret() : 'harbor-local-preview').update(`preview:${payload}`).digest('base64url');
export function previewToken(projectId: string, now = Date.now()): string {
  const payload = `${projectId}.${(now + PREVIEW_HOURS * 3_600_000).toString(36)}`;
  return `${payload}.${previewSign(payload)}`;
}
/** The project a preview token is for, if its signature holds and it hasn't expired. */
export function readPreviewToken(token: string, now = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !/^prj_[a-z0-9]+$/.test(parts[0]!)) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const want = Buffer.from(previewSign(payload));
  const got = Buffer.from(parts[2]!);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return parseInt(parts[1]!, 36) > now ? parts[0]! : null;
}

export async function currentSession(): Promise<Session | null> {
  if (!authEnabled()) return { login: 'local', exp: Number.MAX_SAFE_INTEGER };
  return readSessionValue((await cookies()).get(SESSION_COOKIE)?.value);
}

export class UnauthorizedError extends Error {
  constructor() { super('Sign in to use Harbor.'); }
}

/** For server actions, route handlers and data loads: a second check behind proxy.ts, never the only one. */
export async function requireSession(): Promise<Session> {
  const s = await currentSession();
  if (!s) throw new UnauthorizedError();
  return s;
}

/** Where to send someone after signing in: only a path on this site. */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/');

/** The web app's public origin, for the GitHub redirect URL. */
export const webOrigin = (requestOrigin: string) => (process.env.HARBOR_WEB_URL ?? requestOrigin).replace(/\/$/, '');

import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, createSessionValue, isAllowed, safeNext, SESSION_COOKIE, sessionCookieOptions, STATE_COOKIE, webOrigin } from '../../../auth';

/** GitHub sends the browser back here with ?code&state. Check the state, read the login, check the allowlist. */
export async function GET(request: NextRequest) {
  const origin = webOrigin(request.nextUrl.origin);
  const fail = (error: string) => {
    const res = NextResponse.redirect(`${origin}/login?${new URLSearchParams({ error })}`);
    res.cookies.delete({ name: STATE_COOKIE, path: '/auth' });
    return res;
  };
  if (!authEnabled()) return NextResponse.redirect(`${origin}/`);

  const params = request.nextUrl.searchParams;
  if (params.get('error')) return fail('GitHub sign-in was cancelled.');
  let saved: { state?: string; next?: string } = {};
  try { saved = JSON.parse(request.cookies.get(STATE_COOKIE)?.value ?? '{}'); } catch { /* treated as missing */ }
  const state = params.get('state') ?? '';
  if (!saved.state || saved.state.length !== state.length || !timingSafeEqual(Buffer.from(saved.state), Buffer.from(state))) {
    return fail('That sign-in link expired. Try again.');
  }

  let login: string;
  try {
    const token = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: params.get('code'),
        redirect_uri: `${origin}/auth/github/callback`,
      }),
      cache: 'no-store',
    }).then((r) => r.json() as Promise<{ access_token?: string; error_description?: string }>);
    if (!token.access_token) return fail(token.error_description ?? 'GitHub did not sign you in.');
    const user = await fetch('https://api.github.com/user', {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'Harbor' },
      cache: 'no-store',
    }).then((r) => r.json() as Promise<{ login?: string }>);
    if (!user.login) return fail('Could not read your GitHub account.');
    login = user.login;
  } catch {
    return fail('Could not reach GitHub. Try again.');
  }

  if (!isAllowed(login)) return fail(`@${login} isn't on this Harbor's list of people who can sign in.`);
  const res = NextResponse.redirect(`${origin}${safeNext(saved.next)}`);
  res.cookies.set(SESSION_COOKIE, createSessionValue(login), sessionCookieOptions());
  res.cookies.delete({ name: STATE_COOKIE, path: '/auth' });
  return res;
}

import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, newState, safeNext, secureCookies, STATE_COOKIE, webOrigin } from '../../auth';

/** Start GitHub sign-in: a random state in a short-lived cookie, then GitHub's consent screen. */
export function GET(request: NextRequest) {
  if (!authEnabled()) return NextResponse.redirect(new URL('/', request.url));
  const state = newState();
  const next = safeNext(request.nextUrl.searchParams.get('next'));
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID!);
  url.searchParams.set('redirect_uri', `${webOrigin(request.nextUrl.origin)}/auth/github/callback`);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');
  // No scopes: the public profile (the login) is all Harbor reads.
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true, secure: secureCookies(), sameSite: 'lax', path: '/auth', maxAge: 600,
  });
  return res;
}

import { NextResponse, type NextRequest } from 'next/server';
import { authEnabled, readSessionValue, SESSION_COOKIE } from './app/auth';

/**
 * With sign-in on, every page needs a session except the sign-in flow itself. Server actions and route handlers
 * check again (api.ts, requireSession); this is the first gate, not the only one.
 */
export function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (readSessionValue(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to use Harbor.' } }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the sign-in flow, Next's own assets and the icon.
  matcher: ['/((?!login|auth/|_next/static|_next/image|icon.svg|favicon.ico).*)'],
};

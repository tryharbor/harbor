import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, webOrigin } from '../../auth';

/** Sign out: a POST (a form button), so a link elsewhere can't sign you out. */
export function POST(request: NextRequest) {
  const res = NextResponse.redirect(`${webOrigin(request.nextUrl.origin)}/login`, 303);
  res.cookies.delete({ name: SESSION_COOKIE, path: '/' });
  return res;
}

import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL, internalAuthHeader } from '../../api';
import { currentSession, webOrigin } from '../../auth';

/**
 * Connect an account: ask the API for the platform's consent URL server side (it needs the internal token, which the
 * browser never holds), then send the browser there. The platform's callback still goes straight to the API.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const origin = webOrigin(request.nextUrl.origin);
  if (!(await currentSession())) return NextResponse.redirect(`${origin}/login`);
  const { platform } = await params;
  const brandId = request.nextUrl.searchParams.get('brandId') ?? '';
  const back = (error: string) => NextResponse.redirect(`${origin}/brands/${encodeURIComponent(brandId)}/channels?${new URLSearchParams({ error })}`);
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/v1/channels/${encodeURIComponent(platform)}/connect?${new URLSearchParams({ brandId })}`, {
      headers: internalAuthHeader(),
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return back(`Can't reach the API at ${API_INTERNAL_URL}.`);
  }
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) return NextResponse.redirect(location);
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return back(body.error?.message ?? `The API answered ${res.status}.`);
}

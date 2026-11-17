import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL, internalAuthHeader } from '../../../api';
import { currentSession } from '../../../auth';

/** A draft site's preview HTML (?direction= to compare), fetched server side for the Build page's frames. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  if (!(await currentSession())) return new NextResponse(null, { status: 401 });
  const { siteId } = await params;
  const direction = request.nextUrl.searchParams.get('direction');
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/v1/sites/${encodeURIComponent(siteId)}/preview${direction ? `?direction=${encodeURIComponent(direction)}` : ''}`, { headers: internalAuthHeader(), cache: 'no-store' });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!res.ok) return new NextResponse(null, { status: res.status });
  return new NextResponse(await res.text(), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

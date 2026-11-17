import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL, internalAuthHeader } from '../../../api';
import { readPreviewToken } from '../../../auth';

/**
 * A Full app project's static preview, file by file, at /p/<token>/<path>. The token (auth.ts, previewToken) names one
 * project and expires; the sandbox CSP gives the page a unique origin, so AI-written scripts can't reach Harbor.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; path?: string[] }> }) {
  const { token, path } = await params;
  const projectId = readPreviewToken(token);
  if (!projectId) return new NextResponse('This preview link has expired. Reload the app page.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const rest = (path ?? []).map(encodeURIComponent).join('/') || 'index.html';
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/v1/projects/${encodeURIComponent(projectId)}/preview/${rest}`, { headers: internalAuthHeader(), cache: 'no-store' });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!res.ok) return new NextResponse(null, { status: res.status });
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'content-security-policy': 'sandbox allow-scripts allow-forms allow-modals',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });
}

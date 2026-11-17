import { NextResponse, type NextRequest } from 'next/server';
import { API_INTERNAL_URL, internalAuthHeader } from '../../../../api';
import { currentSession } from '../../../../auth';

/**
 * An assistant option's design as a PNG. The API draws it (the same image "Use this" attaches to the drafts); this
 * fetches it server side, since the browser never holds the internal token.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ chatId: string; optionId: string }> }) {
  if (!(await currentSession())) return new NextResponse(null, { status: 401 });
  const { chatId, optionId } = await params;
  let res: Response;
  try {
    res = await fetch(`${API_INTERNAL_URL}/v1/assistant/chats/${encodeURIComponent(chatId)}/options/${encodeURIComponent(optionId)}/design.png`, {
      headers: internalAuthHeader(),
      cache: 'no-store',
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
  if (!res.ok) return new NextResponse(null, { status: res.status });
  return new NextResponse(res.body, { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'private, max-age=60' } });
}

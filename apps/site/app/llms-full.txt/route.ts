import { llmsFullTxt } from '../../lib/llms';

export const dynamic = 'force-static';
// Rebuilt at most hourly, so a post written ahead appears on its date without a deploy (see lib/blog.ts).
export const revalidate = 3600;

export function GET() {
  return new Response(llmsFullTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

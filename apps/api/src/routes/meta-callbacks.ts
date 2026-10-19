import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';
import { HarborError } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { apiUrl, iso } from '../lib/http.ts';
import { parseSignedRequest } from '../lib/signed-request.ts';
import { deleteChannel, type ChannelRow } from '../services/channels.ts';

/** The platforms whose developer apps are Meta's, and so call these callbacks. */
export const META_PLATFORMS = { instagram: 'Instagram', threads: 'Threads' } as const;
export type MetaPlatform = keyof typeof META_PLATFORMS;
const isMetaPlatform = (p: string): p is MetaPlatform => Object.hasOwn(META_PLATFORMS, p);

interface DeletionRow {
  code: string;
  platform: MetaPlatform;
  channels_deleted: number;
  status: 'received' | 'completed';
  created_at: Date | string;
  completed_at: Date | string | null;
}

/**
 * Meta's deauthorize ("uninstall") and data deletion callbacks for Instagram and Threads (docs/setup/meta-app-review.md).
 * Meta POSTs a form with `signed_request`, signed with the platform's app secret, naming the user by an app-scoped id.
 * Either way Harbor deletes every channel connected to that account, in every brand: the row, its tokens, and the posts,
 * metrics and replies stored for it. Data deletion also answers with a confirmation code and a status page.
 */
export function registerMetaCallbacks(app: App, deps: AppDeps) {
  const { db, secrets } = deps;

  /** Verify the request and delete what Harbor holds for the account. Returns how many channels went. */
  const forgetAccount = async (c: Context, platform: MetaPlatform) => {
    const keys = deps.metaAppSecrets[platform];
    const env = platform === 'instagram' ? 'INSTAGRAM_APP_SECRET' : 'THREADS_APP_SECRET';
    if (!keys.length) throw new HarborError('INVALID_REQUEST', `${META_PLATFORMS[platform]} callbacks need ${env} to check Meta's signature.`);
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const signed = typeof form.signed_request === 'string' ? form.signed_request : '';
    const payload = signed ? parseSignedRequest(signed, keys) : undefined;
    if (!payload) throw new HarborError('INVALID_REQUEST', `signed_request is missing or its signature doesn't match ${env}.`);
    const userId = typeof payload.user_id === 'string' || typeof payload.user_id === 'number' ? String(payload.user_id) : '';
    if (!userId) throw new HarborError('INVALID_REQUEST', 'signed_request names no user_id.');
    // Instagram channels are keyed by the professional account id; the callback may send that or the app-scoped id.
    const rows = await db.query<ChannelRow>('SELECT * FROM channels WHERE platform = $1 AND (platform_account_id = $2 OR app_scoped_id = $2)', [
      platform, userId,
    ]);
    for (const row of rows) await deleteChannel(db, secrets(), row);
    return rows.length;
  };

  const platformParam = (c: Context): MetaPlatform => {
    const p = c.req.param('platform') ?? '';
    if (!isMetaPlatform(p)) throw new HarborError('NOT_FOUND', `No Meta callbacks for ${p}.`);
    return p;
  };

  /** The person removed Harbor in their Instagram or Threads settings. Meta only needs a 200. */
  app.post('/v1/channels/:platform/deauthorize', async (c) => {
    await forgetAccount(c, platformParam(c));
    return c.json({ ok: true });
  });

  /** The person asked Meta to have Harbor delete their data: answer with where to follow it and a confirmation code. */
  app.post('/v1/channels/:platform/data-deletion', async (c) => {
    const platform = platformParam(c);
    const deleted = await forgetAccount(c, platform);
    const code = randomBytes(10).toString('hex');
    await db.query(
      `INSERT INTO data_deletion_requests (code, platform, channels_deleted, status, completed_at) VALUES ($1, $2, $3, 'completed', now())`,
      [code, platform, deleted],
    );
    return c.json({ url: `${apiUrl()}/data-deletion/${code}`, confirmation_code: code });
  });

  /** The status page Meta links the person to. Public: the code is unguessable and the page names no account. */
  app.get('/data-deletion/:code', async (c) => {
    const code = c.req.param('code');
    const [row] = /^[0-9a-f]{20}$/.test(code)
      ? await db.query<DeletionRow>('SELECT * FROM data_deletion_requests WHERE code = $1', [code])
      : [];
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
    if (!row) return c.html(statusPage('Deletion request not found', [`There is no data deletion request with the code <code>${escape(code)}</code>. Check the link Meta gave you.`, contact()]), 404);
    const name = META_PLATFORMS[row.platform];
    const received = new Date(iso(row.created_at)).toUTCString();
    const done = row.completed_at ? new Date(iso(row.completed_at)).toUTCString() : undefined;
    const lines = [
      `Confirmation code: <code>${row.code}</code>`,
      `Received ${received} from ${name}.`,
      row.status === 'completed'
        ? `Status: <strong>completed</strong> ${done ? `on ${done}` : ''}.`
        : 'Status: <strong>in progress</strong>. Harbor finishes deletions within 30 days.',
      row.channels_deleted > 0
        ? `Harbor deleted the ${name} account${row.channels_deleted === 1 ? '' : 's'} connected to it (${row.channels_deleted}), the access tokens, and the posts, metrics and replies Harbor stored for ${row.channels_deleted === 1 ? 'it' : 'them'}.`
        : `Harbor held no data for this ${name} account.`,
      'Backups that contain it are overwritten as they rotate, within 30 days.',
      contact(),
    ];
    return c.html(statusPage(`${name} data deletion`, lines));
  });
}

/** Who to ask about a deletion: HARBOR_CONTACT_EMAIL, or whoever runs this Harbor. */
const contact = () => {
  const email = process.env.HARBOR_CONTACT_EMAIL?.trim();
  return email ? `Questions: <a href="mailto:${escape(email)}">${escape(email)}</a>.` : 'Questions: ask whoever runs this Harbor for you.';
};

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const statusPage = (title: string, lines: string[]) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Harbor</title>
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;color:#1a1a1a;background:#fff}h1{font-size:1.4rem}code{font-size:.95em}@media (prefers-color-scheme:dark){body{color:#eee;background:#111}a{color:#8ab4ff}}</style>
</head><body><h1>${escape(title)}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}</body></html>`;

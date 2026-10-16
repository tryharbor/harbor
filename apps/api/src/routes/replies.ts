import { z } from 'zod';
import type { App, AppDeps } from '../app.ts';
import { check } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { brandConversation, postReplies, refreshPostReplies } from '../services/replies.ts';

const daysSchema = z.coerce.number().int().min(1).max(365);

/** Replies per post, grouped into themes per brand. */
export function registerReplies(app: App, deps: AppDeps) {
  const { db, registry } = deps;

  app.get('/v1/posts/:id/replies', async (c) => c.json(await postReplies(db, registry, c.req.param('id'))));

  /** Fetch the post's replies from its platform now (no-op where the platform doesn't report them). */
  app.post('/v1/posts/:id/replies/refresh', async (c) => {
    await refreshPostReplies(deps.publishDeps(), c.req.param('id'));
    return c.json(await postReplies(db, registry, c.req.param('id')));
  });

  /** Reply themes over the last ?days= (default 30), largest first. */
  app.get('/v1/brands/:id/conversation', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const raw = c.req.query('days');
    return c.json(await brandConversation(db, brand.id, raw ? check(daysSchema, raw) : 30));
  });
}

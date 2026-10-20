import { z } from 'zod';
import type { App, AppDeps } from '../app.ts';
import { check } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { brandConversation, deleteReply, postReplies, refreshPostReplies, respondToReply, setReplyHidden } from '../services/replies.ts';

const daysSchema = z.coerce.number().int().min(1).max(365);
// Instagram's comment limit; the platform checks its own.
const respondSchema = z.object({ text: z.string().trim().min(1, 'Write a reply first.').max(2200) });
const hideSchema = z.object({ hidden: z.boolean() });

/** Replies per post, grouped into themes per brand. */
export function registerReplies(app: App, deps: AppDeps) {
  const { db, registry } = deps;

  app.get('/v1/posts/:id/replies', async (c) => c.json(await postReplies(db, registry, c.req.param('id'))));

  /** Fetch the post's replies from its platform now (no-op where the platform doesn't report them). */
  app.post('/v1/posts/:id/replies/refresh', async (c) => {
    await refreshPostReplies(deps.publishDeps(), c.req.param('id'));
    return c.json(await postReplies(db, registry, c.req.param('id')));
  });

  /** Answer a reply as the post's account (Instagram). Returns the post's replies. */
  app.post('/v1/replies/:id/respond', async (c) => {
    const { text } = check(respondSchema, await c.req.json().catch(() => ({})));
    const postId = await respondToReply(deps.publishDeps(), c.req.param('id'), text);
    return c.json(await postReplies(db, registry, postId));
  });

  /** Hide a reply on the platform ({ hidden: true }) or show it again. Returns the post's replies. */
  app.post('/v1/replies/:id/hide', async (c) => {
    const { hidden } = check(hideSchema, await c.req.json().catch(() => ({})));
    const postId = await setReplyHidden(deps.publishDeps(), c.req.param('id'), hidden);
    return c.json(await postReplies(db, registry, postId));
  });

  /** Delete a reply from the platform. Returns the post's replies. */
  app.delete('/v1/replies/:id', async (c) => {
    const postId = await deleteReply(deps.publishDeps(), c.req.param('id'));
    return c.json(await postReplies(db, registry, postId));
  });

  /** Reply themes over the last ?days= (default 30), largest first. */
  app.get('/v1/brands/:id/conversation', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const raw = c.req.query('days');
    return c.json(await brandConversation(db, brand.id, raw ? check(daysSchema, raw) : 30));
  });
}

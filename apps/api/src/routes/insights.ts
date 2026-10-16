import { z } from 'zod';
import { platformSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { check } from '../lib/http.ts';
import { bestTimesForBrand } from '../services/best-times.ts';
import { loadBrand } from '../services/brands.ts';
import { generateDigest, insightsOverview, requireDigest } from '../services/insights.ts';
import { refreshBrandOutcomes } from '../services/outcomes.ts';

const digestSchema = z.object({ days: z.number().int().min(1).max(90).default(7) }).strict();

/** The insight engine: outcomes, best posting times, weekly digests and the cross-brand overview. */
export function registerInsights(app: App, deps: AppDeps) {
  const { db } = deps;

  /** 7×24 grid of posting slots (weekday 0 = Sunday, server local time), scored 0..1, plus the best 5. */
  app.get('/v1/brands/:id/best-times', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const raw = c.req.query('platform');
    const platform = raw ? check(platformSchema, raw) : undefined;
    return c.json(await bestTimesForBrand(db, brand.id, platform));
  });

  /** Re-evaluate every published post's verdict now (also happens after every snapshot). */
  app.post('/v1/brands/:id/outcomes', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const outcomes = await refreshBrandOutcomes(db, brand.id);
    return c.json({ data: [...outcomes.entries()].map(([postId, o]) => ({ postId, ...o })) });
  });

  /** Write the brand's digest for the last `days` (default 7) days. */
  app.post('/v1/brands/:id/digest', async (c) => {
    const raw = await c.req.json().catch(() => ({}));
    const input = check(digestSchema, raw ?? {});
    const brand = await loadBrand(db, c.req.param('id'));
    const { digest, run } = await generateDigest(deps, brand, input.days);
    return c.json({ ...digest, run }, 201);
  });

  app.get('/v1/brands/:id/digest', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await requireDigest(db, brand.id));
  });

  /** Every brand's last 7 days side by side. Optional ?workspaceId=. */
  app.get('/v1/insights/overview', async (c) => c.json({ brands: await insightsOverview(db, c.req.query('workspaceId') ?? undefined) }));
}

import { HarborError, PLATFORM_METRICS, platformSchema } from '@harbor/core';
import { getProvider } from '@harbor/providers';
import type { App, AppDeps } from '../app.ts';
import { getChannelRow, toChannel, upsertChannel, type ChannelRow } from '../services/channels.ts';

/** An OAuth handshake must finish within this window. */
const STATE_TTL_MIN = 15;

export function registerChannels(app: App, deps: AppDeps) {
  const { db, registry, secrets, webUrl } = deps;
  const back = (brandId: string, params: Record<string, string>) => `${webUrl}/brands/${brandId}?${new URLSearchParams(params)}`;

  /** Which platforms exist, whether their developer app is configured, and what metrics each reports. */
  app.get('/v1/platforms', (c) =>
    c.json({
      data: [...registry.values()].map((p) => ({
        platform: p.identifier,
        name: p.name,
        metrics: PLATFORM_METRICS[p.identifier],
        reportsMetrics: typeof p.fetchPostMetrics === 'function',
      })),
    }),
  );

  /** Every connected account across brands (Home shows the ones that need attention). */
  app.get('/v1/channels', async (c) => {
    const rows = await db.query<ChannelRow>('SELECT * FROM channels ORDER BY brand_id, platform, handle');
    return c.json({ data: rows.map(toChannel) });
  });

  app.get('/v1/brands/:brandId/channels', async (c) => {
    const rows = await db.query<ChannelRow>('SELECT * FROM channels WHERE brand_id = $1 ORDER BY platform, handle', [c.req.param('brandId')]);
    return c.json({ data: rows.map(toChannel) });
  });

  /** Start connecting an account: the browser lands here from the web app and is sent on to the platform's consent screen. */
  app.get('/v1/channels/:platform/connect', async (c) => {
    const brandId = c.req.query('brandId') ?? '';
    const [brand] = await db.query('SELECT id FROM brands WHERE id = $1', [brandId]);
    if (!brand) throw new HarborError('NOT_FOUND', `Brand ${brandId || '(missing brandId)'} not found.`);
    const provider = getProvider(registry, c.req.param('platform'));
    if (!provider) throw new HarborError('NOT_FOUND', `Unknown platform ${c.req.param('platform')}.`);
    try {
      const auth = await provider.generateAuthUrl();
      await db.query('INSERT INTO oauth_states (state, platform, brand_id, code_verifier) VALUES ($1, $2, $3, $4)', [
        auth.state, provider.identifier, brandId, auth.codeVerifier,
      ]);
      return c.redirect(auth.url, 302);
    } catch (err) {
      return c.redirect(back(brandId, { error: err instanceof Error ? err.message : 'Could not start connecting.' }), 302);
    }
  });

  /** The platform sends the browser back here with ?code&state (or ?error). */
  app.get('/v1/channels/:platform/callback', async (c) => {
    const platform = platformSchema.safeParse(c.req.param('platform'));
    const state = c.req.query('state') ?? '';
    const [pending] = await db.query<{ brand_id: string; code_verifier: string; platform: string; fresh: boolean }>(
      `DELETE FROM oauth_states WHERE state = $1
       RETURNING brand_id, code_verifier, platform, created_at > now() - make_interval(mins => $2) AS fresh`,
      [state, STATE_TTL_MIN],
    );
    if (!pending || !platform.success || pending.platform !== platform.data) {
      throw new HarborError('INVALID_REQUEST', 'This connection link is invalid or was already used. Start connecting again from Harbor.');
    }
    const brandId = pending.brand_id;
    const denied = c.req.query('error_description') ?? c.req.query('error');
    if (denied) return c.redirect(back(brandId, { error: `The platform said: ${denied}` }), 302);
    if (!pending.fresh) return c.redirect(back(brandId, { error: 'The connection took longer than 15 minutes. Try again.' }), 302);

    const provider = registry.get(platform.data)!;
    try {
      const tokens = await provider.authenticate({ code: c.req.query('code') ?? '', codeVerifier: pending.code_verifier, state });
      const channel = await upsertChannel(db, secrets(), brandId, platform.data, tokens);
      return c.redirect(back(brandId, { connected: `${provider.name} @${channel.account.handle}` }), 302);
    } catch (err) {
      return c.redirect(back(brandId, { error: `Connecting ${provider.name} failed: ${err instanceof Error ? err.message : 'unknown error'}` }), 302);
    }
  });

  /** Disconnect in Harbor: forgets the token. (Revoke access on the platform's own settings page too.) */
  app.delete('/v1/channels/:id', async (c) => {
    const row = await getChannelRow(db, c.req.param('id'));
    await db.query('DELETE FROM channels WHERE id = $1', [row.id]);
    await secrets().delete(row.token_ref);
    return c.body(null, 204);
  });
}

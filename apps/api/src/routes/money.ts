import { z } from 'zod';
import { moneyEntryInputSchema, moneySettingsPatchSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { addEntry, connectStripe, deleteEntry, disconnectStripe, listEntries, loadSettings, moneySummary, syncStripe, todayLocal, updateSettings } from '../services/money.ts';

const connectSchema = z.object({ key: z.string().trim().min(1).max(300).optional() }).strict();

/** Money: the log, settings, Stripe and the summary. Harbor only reads from Stripe; it never moves money. */
export function registerMoney(app: App, deps: AppDeps) {
  const { db } = deps;

  /** Everything the Money page shows: settings (never the key), the summary and the latest 50 entries. */
  app.get('/v1/brands/:id/money', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    const today = todayLocal();
    const [settings, summary, entries] = await Promise.all([loadSettings(db, brand.id), moneySummary(db, brand.id, today), listEntries(db, brand.id)]);
    return c.json({ settings, summary, entries });
  });

  app.post('/v1/brands/:id/money/entries', async (c) => {
    const input = await body(c, moneyEntryInputSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await addEntry(db, brand, input), 201);
  });

  app.delete('/v1/money/entries/:id', async (c) => {
    await deleteEntry(db, c.req.param('id'));
    return c.body(null, 204);
  });

  app.patch('/v1/brands/:id/money/settings', async (c) => {
    const input = await body(c, moneySettingsPatchSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await updateSettings(db, brand.id, input, todayLocal()));
  });

  /** Live: verifies and stores a restricted key (encrypted). Sandbox: connects sample data; no key needed. */
  app.post('/v1/brands/:id/money/stripe', async (c) => {
    const input = await body(c, connectSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await connectStripe(deps, brand, input.key));
  });

  app.post('/v1/brands/:id/money/stripe/sync', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await syncStripe(deps, brand));
  });

  /** Forgets the key. Synced entries stay in the log. */
  app.delete('/v1/brands/:id/money/stripe', async (c) => {
    const brand = await loadBrand(db, c.req.param('id'));
    return c.json(await disconnectStripe(deps, brand.id));
  });
}

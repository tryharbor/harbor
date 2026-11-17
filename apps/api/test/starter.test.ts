import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, createDeps, type App } from '../src/app.ts';
import { noSandbox } from '../src/build/sandbox.ts';
import { parsePrice } from '../src/build/starter.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

describe('parsePrice', () => {
  it('reads the first price and how often it is charged', () => {
    expect(parsePrice('$32 a month, shipping included')).toEqual({ amountCents: 3200, currency: 'usd', interval: 'month', label: '$32 a month' });
    expect(parsePrice('€45 per session')).toEqual({ amountCents: 4500, currency: 'eur', interval: null, label: '€45' });
    expect(parsePrice('Plans from £9.50/month')).toMatchObject({ amountCents: 950, currency: 'gbp', interval: 'month', label: '£9.50 a month' });
    expect(parsePrice('120 USD yearly')).toMatchObject({ amountCents: 12000, currency: 'usd', interval: 'year' });
    expect(parsePrice('$18 a bag, or $32/month subscription')).toMatchObject({ amountCents: 3200, interval: 'month', label: '$32 a month' });
    expect(parsePrice('$18 a bag, $5 shipping')).toMatchObject({ amountCents: 1800, interval: null, label: '$18' });
    expect(parsePrice('Ask for a quote')).toEqual({ amountCents: null, currency: 'usd', interval: null, label: '' });
  });
});

/**
 * The starter running for real: Harbor writes it for a business, then this test starts it with Node (it's Harbor's own
 * template code, not AI-written) against a fake Stripe, and goes through sign-up, sign-in, the guards and a payment.
 */
describe('the starter app', () => {
  let db: Db;
  let app: App;
  let dir: string;
  let child: ChildProcess;
  let stripe: Server;
  let base: string;
  const stripeCalls: { method: string; path: string; body: string; auth: string }[] = [];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'harbor-starter-'));
    db = await openDb('memory://');
    app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated', sandboxes: noSandbox, projectsDir: dir }));
    const send = sender(() => app);
    const memory = { ...RICH_MEMORY, business: { oneLiner: 'Small-batch coffee, roasted to order.', pricing: '$32 a month, shipping included' } };
    const brandId = (await (await send('POST', '/v1/brands', { name: 'Tidewater', memory })).json()).id;
    const project = await (await send('POST', `/v1/brands/${brandId}/projects`, { name: 'Coffee club' })).json();

    stripe = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        stripeCalls.push({ method: req.method!, path: req.url!, body, auth: String(req.headers.authorization) });
        res.setHeader('content-type', 'application/json');
        if (req.method === 'POST' && req.url === '/v1/checkout/sessions') return res.end(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1' }));
        if (req.url === '/v1/checkout/sessions/cs_test_1') {
          const ref = new URLSearchParams(stripeCalls.find((c) => c.method === 'POST')?.body).get('client_reference_id');
          return res.end(JSON.stringify({ id: 'cs_test_1', status: 'complete', payment_status: 'paid', client_reference_id: ref, customer: 'cus_1' }));
        }
        res.statusCode = 404;
        res.end(JSON.stringify({ error: { message: 'No such session' } }));
      });
    });
    await new Promise<void>((r) => stripe.listen(0, '127.0.0.1', r));

    const port = 41000 + Math.floor(Math.random() * 2000);
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
      cwd: join(dir, project.id),
      env: { PATH: process.env.PATH, PORT: String(port), HOST: '127.0.0.1', DATABASE_PATH: join(dir, 'app.db'), STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: `http://127.0.0.1:${(stripe.address() as AddressInfo).port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      let err = '';
      child.stdout!.on('data', (d) => String(d).includes('running on port') && resolve());
      child.stderr!.on('data', (d) => (err += d));
      child.on('exit', (code) => reject(new Error(`starter exited ${code}: ${err}`)));
    });
  }, 30_000);

  afterAll(async () => {
    child?.kill();
    stripe?.close();
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const go = (path: string, opts: { method?: string; form?: Record<string, string>; cookie?: string; origin?: string; accept?: string } = {}) =>
    fetch(base + path, {
      method: opts.method ?? (opts.form ? 'POST' : 'GET'),
      redirect: 'manual',
      headers: {
        ...(opts.form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.origin ? { origin: opts.origin } : {}),
        ...(opts.accept ? { accept: opts.accept } : {}),
      },
      body: opts.form ? new URLSearchParams(opts.form) : undefined,
    });
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0]!;

  it('shows the business’s home page with its price', async () => {
    const res = await go('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('Coffee club');
    expect(html).toContain('Small-batch coffee, roasted to order.');
    expect(html).toContain('$32 a month');
    expect((await go('/styles.css')).headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect((await go('/..%2Fconfig.js')).status).toBe(404);
  });

  it('signs up, keeps the account private, signs out and back in', async () => {
    expect((await go('/account')).headers.get('location')).toBe('/signin?next=/account');
    expect(await (await go('/signup', { form: { email: 'a@example.com', password: 'short' } })).text()).toContain('at least 8 characters');

    const signUp = await go('/signup', { form: { email: 'Owner@Example.com', password: 'correct horse' } });
    expect(signUp.status).toBe(303);
    expect(signUp.headers.get('set-cookie')).toMatch(/^sid=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
    const cookie = cookieOf(signUp);
    const account = await (await go('/account', { cookie })).text();
    expect(account).toContain('owner@example.com');
    expect(account).toContain('Pay ($32 a month)');

    expect(await (await go('/signup', { form: { email: 'owner@example.com', password: 'another one' } })).text()).toContain('already an account');

    const out = await go('/signout', { method: 'POST', cookie });
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await go('/account', { cookie })).status).toBe(303); // the old session is gone

    expect(await (await go('/signin', { form: { email: 'owner@example.com', password: 'wrong password' } })).text()).toContain('don’t match');
    const back = await go('/signin', { form: { email: 'owner@example.com', password: 'correct horse', next: '/account' } });
    expect(back.headers.get('location')).toBe('/account');
    expect((await go('/account', { cookie: cookieOf(back) })).status).toBe(200);
  });

  it('refuses forms from other sites, escapes what visitors type, and slows down guessing', async () => {
    expect((await go('/signup', { form: { email: 'x@example.com', password: 'longenough' }, origin: 'https://evil.example' })).status).toBe(403);
    expect(await (await go('/signin', { form: { email: '<img src=x onerror=alert(1)>', password: 'x' } })).text()).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // After signing in, never send someone on to another site.
    expect((await go('/signin', { form: { email: 'owner@example.com', password: 'correct horse', next: '//evil.example' } })).headers.get('location')).toBe('/account');
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await go('/signin', { form: { email: 'guess@example.com', password: `nope${i}` } })).status;
    expect(last).toBe(429);
  });

  it('takes a payment through Stripe Checkout and marks the customer paid', async () => {
    const cookie = cookieOf(await go('/signup', { form: { email: 'buyer@example.com', password: 'buyer password' } }));
    const pay = await go('/checkout', { method: 'POST', cookie });
    expect(pay.status).toBe(303);
    expect(pay.headers.get('location')).toBe('https://checkout.stripe.test/c/cs_test_1');
    const call = stripeCalls.find((c) => c.method === 'POST')!;
    expect(call.auth).toBe('Bearer sk_test_fake');
    const params = new URLSearchParams(call.body);
    expect(Object.fromEntries(params)).toMatchObject({
      mode: 'subscription',
      'line_items[0][price_data][unit_amount]': '3200',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][recurring][interval]': 'month',
      customer_email: 'buyer@example.com',
    });
    expect(params.get('success_url')).toBe(`${base}/checkout/return?session_id={CHECKOUT_SESSION_ID}`);

    // Inside Harbor's preview the page asks for JSON instead of a redirect.
    expect(await (await go('/checkout', { method: 'POST', cookie, accept: 'application/json' })).json()).toEqual({ url: 'https://checkout.stripe.test/c/cs_test_1' });

    expect((await go('/checkout/return?session_id=not-a-session')).status).toBe(400);
    expect(await (await go('/checkout/return?session_id=cs_test_1')).text()).toContain('you’re all set');
    expect(await (await go('/account', { cookie })).text()).toContain('Paid · since');
  });
});

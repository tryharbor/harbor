// Payments through Stripe Checkout: Stripe's own page takes the card, then sends the customer back here.
// Turned on by the STRIPE_SECRET_KEY setting (a test key, sk_test_…, while trying it out) and a price in config.js.
import config from '../config.js';
import { db } from './db.js';

const API = process.env.STRIPE_API_BASE || 'https://api.stripe.com';

export const enabled = () => !!process.env.STRIPE_SECRET_KEY && !!config.price.amountCents;

async function stripe(path, params) {
  const res = await fetch(API + path, {
    method: params ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(params ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Stripe answered ${res.status}`);
  return data;
}

/** A Stripe Checkout page for this customer; returns its address. */
export async function checkout(user, origin) {
  const p = config.price;
  const params = {
    mode: p.interval ? 'subscription' : 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': p.currency,
    'line_items[0][price_data][unit_amount]': String(p.amountCents),
    'line_items[0][price_data][product_data][name]': config.productName,
    client_reference_id: String(user.id),
    customer_email: user.email,
    success_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/account`,
  };
  if (p.interval) params['line_items[0][price_data][recurring][interval]'] = p.interval;
  return (await stripe('/v1/checkout/sessions', params)).url;
}

/** After Checkout: ask Stripe whether it was paid, and mark the customer paid. Returns their user id, or undefined. */
export async function confirm(sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId) || !process.env.STRIPE_SECRET_KEY) return undefined;
  const s = await stripe(`/v1/checkout/sessions/${sessionId}`);
  const paid = s.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
  const userId = Number(s.client_reference_id);
  if (!paid || !userId) return undefined;
  db.prepare("UPDATE users SET paid_at = COALESCE(paid_at, datetime('now')), stripe_customer = COALESCE(?, stripe_customer) WHERE id = ?").run(typeof s.customer === 'string' ? s.customer : null, userId);
  return userId;
}

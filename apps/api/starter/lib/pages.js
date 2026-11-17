// The app's pages, as plain HTML. Everything shown to visitors goes through esc() so their input can't become code.
// The home page's content lives in content/home.html, so it's easy to change on its own.
import { readFileSync } from 'node:fs';
import config from '../config.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function layout(title, body, user) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} · ${esc(config.businessName)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="top">
    <a class="brand" href="/">${esc(config.businessName)}</a>
    <nav>
      ${user ? `<a href="/account">Account</a>
      <form method="post" action="/signout"><button class="link" type="submit">Sign out</button></form>` : `<a href="/signin">Sign in</a>
      <a class="btn small" href="/signup">Create account</a>`}
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer class="muted">© ${new Date().getFullYear()} ${esc(config.businessName)}</footer>
</body>
</html>`;
}

const field = (name, label, type, value = '', extra = '') =>
  `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
const nextInput = (next) => (next ? `<input type="hidden" name="next" value="${esc(next)}">` : '');
const errorBox = (error) => (error ? `<p class="error" role="alert">${esc(error)}</p>` : '');

export function home(user) {
  let content = '';
  try {
    content = readFileSync('content/home.html', 'utf8');
  } catch {
    content = `<section class="hero"><h1>${esc(config.productName)}</h1></section>`;
  }
  return layout(config.productName, content.replaceAll('{{account_link}}', user ? '/account' : '/signup'), user);
}

export function signUp({ email = '', error, next } = {}) {
  return layout('Create an account', `<section class="card narrow">
    <h1>Create an account</h1>
    ${errorBox(error)}
    <form method="post" action="/signup" class="stack">
      ${nextInput(next)}
      ${field('email', 'Email', 'email', email, 'autocomplete="email"')}
      ${field('password', 'Password (8 characters or more)', 'password', '', 'autocomplete="new-password" minlength="8"')}
      <button class="btn" type="submit">Create account</button>
    </form>
    <p class="muted">Already have one? <a href="/signin">Sign in</a></p>
  </section>`);
}

export function signIn({ email = '', error, next } = {}) {
  return layout('Sign in', `<section class="card narrow">
    <h1>Sign in</h1>
    ${errorBox(error)}
    <form method="post" action="/signin" class="stack">
      ${nextInput(next)}
      ${field('email', 'Email', 'email', email, 'autocomplete="email"')}
      ${field('password', 'Password', 'password', '', 'autocomplete="current-password"')}
      <button class="btn" type="submit">Sign in</button>
    </form>
    <p class="muted">New here? <a href="/signup">Create an account</a></p>
  </section>`);
}

export function account(user, { message } = {}) {
  const note = message === 'nopay' ? '<p class="notice">Payments aren’t switched on yet. The owner adds their Stripe key in Harbor to turn them on.</p>'
    : message === 'payfail' ? '<p class="error">Payments couldn’t start just now. Nothing was charged; please try again later.</p>' : '';
  const price = config.price.label ? ` (${esc(config.price.label)})` : '';
  const plan = user.paid_at
    ? `<p class="pill">Paid · since ${esc(user.paid_at.slice(0, 10))}</p>`
    : `<form method="post" action="/checkout" id="checkout"><button class="btn" type="submit">Pay${price}</button></form>
    <script>
      // Inside a frame (Harbor's preview) Stripe can't open in place, so open it in a new tab.
      const f = document.getElementById('checkout');
      if (window.top !== window) f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tab = window.open('', '_blank');
        const res = await fetch('/checkout', { method: 'POST', headers: { accept: 'application/json' } });
        if (res.redirected || !res.ok) { tab && tab.close(); location.href = res.url; return; }
        const { url } = await res.json();
        if (tab) tab.location = url; else location.href = url;
      });
    </script>`;
  return layout('Your account', `<section class="card narrow">
    <h1>Your account</h1>
    ${note}
    <p>Signed in as <strong>${esc(user.email)}</strong></p>
    ${plan}
  </section>`, user);
}

export function paymentResult(ok) {
  return layout(ok ? 'Payment received' : 'Payment not finished', `<section class="card narrow">
    <h1>${ok ? 'Thank you, you’re all set.' : 'That payment didn’t go through.'}</h1>
    <p class="muted">${ok ? 'Your payment was received.' : 'Nothing was charged. You can try again from your account.'}</p>
    <a class="btn" href="/account">Go to your account</a>
  </section>`);
}

export const message = (text) => layout('Notice', `<section class="card narrow"><p>${esc(text)}</p><a href="/">Back home</a></section>`);
export const notFound = () => layout('Not found', `<section class="card narrow"><h1>Page not found</h1><a href="/">Back home</a></section>`);

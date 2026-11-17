import Link from 'next/link';
import { addMoneyEntry, connectStripe, deleteMoneyEntry, disconnectStripe, saveMoneySettings, syncStripe } from '../actions';
import { getBrands, getMode, getMoney, loadAll, type BrandView, type Mode, type MoneyEntry, type MoneySettings, type MoneySummary } from '../api';
import { BrandFilter } from '../components/brand-filter';
import { RevenueChart } from '../components/revenue-chart';
import { Select } from '../components/select';
import { SubmitButton } from '../components/submit-button';
import { Flash, LoadError, PageHeader, when } from '../ui';

export const dynamic = 'force-dynamic';

const EXPENSE = ['Software', 'Marketing', 'Supplies', 'Inventory', 'Contractors', 'Rent', 'Fees', 'Other'];
const REVENUE = ['Sales', 'Subscriptions', 'Services', 'Other'];

const fmt = (cents: number, currency: string, digits = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(cents / 100);
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Pace({ s }: { s: MoneySummary }) {
  if (s.paceVsNormal === undefined) return <span className="small dim">Normal week shows after 3 weeks of sales</span>;
  const pct = Math.round((s.paceVsNormal - 1) * 100);
  const flat = Math.abs(pct) < 5;
  return <span className={`verdict ${flat ? 'met' : pct > 0 ? 'outperformed' : 'underperformed'}`}>{flat ? 'On pace with a normal week' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% vs a normal week so far`}</span>;
}

function Runway({ s }: { s: MoneySummary }) {
  if (s.cashCents === undefined) return <><strong>–</strong><span className="small dim">Add cash on hand to see runway</span></>;
  if (s.monthlyNetCents === undefined) return <><strong>{fmt(s.cashCents, s.currency)}</strong><span className="small dim">Cash on hand · runway after a full month</span></>;
  if (s.runwayMonths === undefined) return <><strong>{fmt(s.cashCents, s.currency)}</strong><span className="small dim">Cash on hand · not burning cash</span></>;
  return <><strong>{s.runwayMonths} mo</strong><span className="small dim">{fmt(s.cashCents, s.currency)} cash at {fmt(-s.monthlyNetCents, s.currency)}/mo burn</span></>;
}

function StripeCard({ brandId, settings, mode }: { brandId: string; settings: MoneySettings; mode: Mode }) {
  if (settings.stripe) {
    return (
      <section className="stack">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Stripe</h2>
          <span className="pill s-connected">{settings.stripe.label}</span>
        </div>
        <p className="small muted">Charges come in as revenue, refunds and each day’s Stripe fees as expenses. Harbor only reads from Stripe; it never moves money.{settings.stripe.syncedAt ? ` Last synced ${when(settings.stripe.syncedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}</p>
        <div className="row">
          <form action={syncStripe}><input type="hidden" name="brandId" value={brandId} /><SubmitButton className="primary" pending="Syncing…">Sync now</SubmitButton></form>
          <form action={disconnectStripe}><input type="hidden" name="brandId" value={brandId} /><button type="submit" className="link-button small">Disconnect</button></form>
        </div>
      </section>
    );
  }
  const sandbox = mode.publish === 'sandbox';
  return (
    <section className="stack">
      <h2 style={{ margin: 0 }}>Connect Stripe</h2>
      {sandbox ? (
        <>
          <p className="small muted">Sandbox mode: try the Money page with four months of sample sales. Nothing connects to Stripe.</p>
          <form action={connectStripe}><input type="hidden" name="brandId" value={brandId} /><SubmitButton className="primary" pending="Loading sample data…">Use sample data</SubmitButton></form>
        </>
      ) : (
        <form action={connectStripe} className="stack">
          <input type="hidden" name="brandId" value={brandId} />
          <p className="small muted">
            In Stripe, create a <a href="https://dashboard.stripe.com/apikeys/create" target="_blank" rel="noreferrer">restricted key</a> with <strong>Read</strong> access to Balance only, and paste it here. Harbor stores it encrypted and only reads from Stripe.
          </p>
          <div className="field">
            <label htmlFor="key">Restricted key</label>
            <input id="key" name="key" type="password" autoComplete="off" required placeholder="rk_live_…" />
          </div>
          <div><SubmitButton className="primary" pending="Connecting…">Connect and sync</SubmitButton></div>
        </form>
      )}
    </section>
  );
}

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ brand?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const base = await loadAll<[BrandView[], Mode]>([getBrands(), getMode()]);
  if (!base.ok) return <LoadError message={base.error} />;
  const [brands, mode] = base.data;
  const businesses = brands.filter((b) => b.kind === 'brand');
  const brand = businesses.find((b) => b.id === s.brand) ?? businesses[0];
  if (!brand) {
    return (
      <>
        <PageHeader title="Money" sub="Revenue, spending and runway for each business." />
        <div className="empty"><span>Add a business first.</span><Link className="button primary" href="/brands/new">Add a business</Link></div>
      </>
    );
  }
  const res = await loadAll<[{ settings: MoneySettings; summary: MoneySummary; entries: MoneyEntry[] }]>([getMoney(brand.id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [{ settings, summary, entries }] = res.data;
  const cur = summary.currency;
  const hrefs = Object.fromEntries(businesses.map((b) => [b.id, `/money?brand=${b.id}`]));
  const net = summary.netThisMonthCents;
  const hasData = entries.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title={`${brand.name.replace(/\s*\(demo\)$/, '')}'s money`}
        sub="What came in, what went out, and how long the cash lasts. Harbor reads; it never moves money."
        actions={<BrandFilter brands={businesses} current={brand.id} hrefs={hrefs} allHref={`/money?brand=${brand.id}`} width={220} />}
      />
      <Flash params={s} />

      <div className="stat-strip">
        <div className="stat">
          <span className="label">Revenue this week</span>
          <strong>{fmt(summary.revenueThisWeekCents, cur)}</strong>
          <Pace s={summary} />
        </div>
        <div className="stat">
          <span className="label">Spent this month</span>
          <strong>{fmt(summary.spendThisMonthCents, cur)}</strong>
          <span className="small dim">{fmt(summary.revenueThisMonthCents, cur)} came in</span>
        </div>
        <div className="stat">
          <span className="label">Net this month</span>
          <strong>{net < 0 ? '−' : ''}{fmt(Math.abs(net), cur)}</strong>
          <span className="small dim">{net < 0 ? 'More out than in so far' : net > 0 ? 'More in than out so far' : 'Even so far'}</span>
        </div>
        <div className="stat">
          <span className="label">Runway</span>
          <Runway s={summary} />
        </div>
      </div>

      {hasData ? (
        <section className="stack">
          <div className="spread"><h2 style={{ margin: 0 }}>Weekly revenue</h2><span className="small dim">Last 12 weeks · {cur}</span></div>
          <RevenueChart weeks={summary.weeks} normalCents={summary.normalWeekCents} currency={cur} />
          <details>
            <summary className="small muted">Show as a table</summary>
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>Week of</th><th className="num">Revenue</th><th className="num">Spent</th></tr></thead>
              <tbody>
                {[...summary.weeks].reverse().map((w) => (
                  <tr key={w.start}><td>{day(w.start)}</td><td className="num">{fmt(w.revenueCents, cur)}</td><td className="num">{fmt(w.expenseCents, cur)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
          {summary.otherCurrencyEntries ? <span className="small dim">{summary.otherCurrencyEntries} entries in other currencies aren’t counted.</span> : null}
        </section>
      ) : null}

      <div className="grid-2">
        <section className="stack">
          <div className="spread"><h2 style={{ margin: 0 }}>Log</h2><span className="small dim">Latest {entries.length}</span></div>
          {hasData ? (
            <ul className="list money-log">
              {entries.map((e) => (
                <li key={e.id}>
                  <span className="small dim">{day(e.occurredOn)}</span>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="evidence-text">{e.note || e.category || (e.kind === 'revenue' ? 'Revenue' : 'Expense')}</span>
                    <span className="small dim">{[e.category, e.source === 'stripe' ? 'Stripe' : 'Added by hand'].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className={`num money-amt ${e.kind}`}>{e.kind === 'revenue' ? '+' : '−'}{fmt(e.amountCents, e.currency, 2)}</span>
                  {e.source === 'manual' ? (
                    <form action={deleteMoneyEntry}>
                      <input type="hidden" name="brandId" value={brand.id} />
                      <input type="hidden" name="entryId" value={e.id} />
                      <button type="submit" className="x-button" aria-label={`Delete ${e.note || e.category || 'entry'}`} title="Delete">×</button>
                    </form>
                  ) : <span />}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty"><span>Nothing logged yet. Connect Stripe to bring in sales, or add revenue and expenses by hand.</span></div>
          )}
        </section>

        <aside className="stack-lg">
          <StripeCard brandId={brand.id} settings={settings} mode={mode} />

          <section>
            <form action={addMoneyEntry} className="stack">
              <h2 style={{ margin: 0 }}>Add an entry</h2>
              <input type="hidden" name="brandId" value={brand.id} />
              <div className="segmented" role="radiogroup" aria-label="Kind">
                <label className="seg-radio"><input type="radio" name="kind" value="expense" defaultChecked />Expense</label>
                <label className="seg-radio"><input type="radio" name="kind" value="revenue" />Revenue</label>
              </div>
              <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="field"><label htmlFor="amount">Amount ({cur})</label><input id="amount" name="amount" inputMode="decimal" required placeholder="49.00" /></div>
                <div className="field"><label htmlFor="occurredOn">Date</label><input id="occurredOn" name="occurredOn" type="date" required defaultValue={summary.today} /></div>
              </div>
              <div className="field">
                <label htmlFor="category">Category</label>
                <Select id="category" name="category" defaultValue="" ariaLabel="Category" options={[{ value: '', label: 'None' }, ...EXPENSE.map((c) => ({ value: c, label: c, hint: 'Expense' })), ...REVENUE.filter((c) => c !== 'Other').map((c) => ({ value: c, label: c, hint: 'Revenue' }))]} />
              </div>
              <div className="field"><label htmlFor="note">Note</label><input id="note" name="note" maxLength={500} placeholder="e.g. Canva subscription" /></div>
              <div><SubmitButton className="primary" pending="Adding…">Add</SubmitButton></div>
            </form>
          </section>

          <section>
            <form action={saveMoneySettings} className="stack">
              <h2 style={{ margin: 0 }}>Cash on hand</h2>
              <p className="small muted">What’s in the business account today. With a few months of history, Harbor works out how long it lasts.</p>
              <input type="hidden" name="brandId" value={brand.id} />
              <div className="grid-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <div className="field"><label htmlFor="cash">Amount</label><input id="cash" name="cash" inputMode="decimal" defaultValue={settings.cashCents !== undefined ? (settings.cashCents / 100).toFixed(2) : ''} placeholder="12000" /></div>
                <div className="field"><label htmlFor="currency">Currency</label><input id="currency" name="currency" maxLength={3} defaultValue={settings.currency} /></div>
              </div>
              {settings.cashAsOf ? <span className="small dim">As of {day(settings.cashAsOf)}. Leave it empty to clear.</span> : null}
              <div><SubmitButton pending="Saving…">Save</SubmitButton></div>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}

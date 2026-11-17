import { PlatformIcon } from '../platform-icon';
import './os.css';

/**
 * Product previews for the startup-OS pages (Your business, Build, Market, Money). Static and illustrative: they show
 * the Tidewater Coffee demo business the way Harbor shows it, not a real customer.
 */

const TIDE = { brand: '#b8502f', cream: '#f1e3c7', ink: '#2a2118' };

// ---- Your business ----

export function BusinessFactsPreview() {
  const rows = [
    ['What you sell', 'Small-batch coffee, roasted to order every two weeks'],
    ['Who buys it', 'Home brewers who want fresher beans than the supermarket'],
    ['What it costs', '$18 a bag, or $32 a month'],
    ['Why people pick you', 'Roasted within 48 hours of shipping'],
    ['Where', 'Online, shipping across the US'],
  ];
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Your business</span><span className="a-pill good">Saved</span></div>
      {rows.map(([k, v]) => (
        <div key={k} className="os-field"><span className="a-label">{k}</span><span>{v}</span></div>
      ))}
    </div>
  );
}

export function BrandKitPreview() {
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Branding</span></div>
      <div className="os-swatches">
        {[[TIDE.brand, 'Rust'], [TIDE.cream, 'Cream'], [TIDE.ink, 'Roast'], ['#6f8f6a', 'Sage']].map(([c, n]) => (
          <div key={n}><i style={{ background: c }} /><span>{n}</span></div>
        ))}
      </div>
      <div className="os-field"><span className="a-label">Headings</span><span style={{ fontFamily: 'Georgia, serif', fontSize: 18 }}>Fraunces</span></div>
      <div className="os-field"><span className="a-label">Tagline</span><span>Coffee worth waiting two weeks for.</span></div>
      <div className="os-field"><span className="a-label">Style</span><span>Warm, honest, a little playful</span></div>
    </div>
  );
}

export function FromOnePlacePreview() {
  const uses = [
    ['Website', 'Your offer, price and tagline on the page'],
    ['App', 'Your colours, your product, your price at checkout'],
    ['Posts', 'Written about what you actually sell'],
    ['Money', 'Sales sorted by what you sell'],
  ];
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Tidewater Coffee is used in</span></div>
      {uses.map(([k, v]) => (
        <div key={k} className="os-row"><strong>{k}</strong><span className="os-muted">{v}</span><span className="up">✓</span></div>
      ))}
    </div>
  );
}

// ---- Build ----

function MiniSite({ variant }: { variant: 'bold' | 'classic' | 'minimal' }) {
  const bold = variant === 'bold';
  const minimal = variant === 'minimal';
  return (
    <div className="os-site" style={{ background: bold ? TIDE.brand : minimal ? '#fff' : TIDE.cream, color: bold ? '#fff' : TIDE.ink }}>
      <span className="os-site-nav" style={{ borderColor: bold ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.1)' }}>Tidewater Coffee</span>
      <strong style={{ fontFamily: minimal ? 'inherit' : 'Georgia, serif', fontSize: bold ? 15 : 13 }}>Coffee worth waiting two weeks for.</strong>
      <span className="os-site-btn" style={{ background: bold ? '#fff' : TIDE.brand, color: bold ? TIDE.brand : '#fff' }}>Start a subscription</span>
    </div>
  );
}

export function SitePickerPreview() {
  const designs = [['bold', 'Bold'], ['classic', 'Classic'], ['minimal', 'Minimal']] as const;
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Pick a design</span><span className="os-muted">Same words, three looks</span></div>
      <div className="os-three">
        {designs.map(([v, n]) => (
          <div key={v} className={`os-design${v === 'classic' ? ' on' : ''}`}>
            <MiniSite variant={v} />
            <div className="os-head"><strong>{n}</strong>{v === 'classic' ? <span className="a-pill good">In use</span> : <span className="a-btn">Use</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AppBuilderPreview() {
  return (
    <div className="os-builder">
      <div className="os-chat">
        <span className="os-you">A page where customers pick a roast, a grind and a delivery day, and pay monthly.</span>
        <span className="os-agent">Your order page is ready. Customers create an account, pick their coffee and pay $32 a month. You’ll see every order on your orders page.</span>
        <span className="a-label">Worked through 15 steps</span>
        <span className="os-compose">Ask for the next thing…</span>
      </div>
      <div className="os-app">
        <span className="os-app-bar" style={{ background: TIDE.brand }}>Tidewater Coffee</span>
        <div className="os-app-body">
          <strong>Start a subscription</strong>
          <span className="os-select">Roast: Medium</span>
          <span className="os-select">Grind: Whole bean</span>
          <span className="os-select">Delivery: Monday</span>
          <span className="os-site-btn" style={{ background: TIDE.brand, color: '#fff' }}>Pay $32 a month</span>
        </div>
      </div>
    </div>
  );
}

export function AppBasicsPreview() {
  const parts = [
    ['Customer accounts', 'Sign up, sign in, their own page'],
    ['A database', 'Orders, members, bookings: kept safe'],
    ['Payments', 'Through your own Stripe account'],
    ['Your look', 'Your colours and words from the start'],
  ];
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Every new app starts with</span></div>
      {parts.map(([k, v]) => (
        <div key={k} className="os-row"><span className="up">✓</span><strong>{k}</strong><span className="os-muted">{v}</span></div>
      ))}
    </div>
  );
}

export function VersionsPreview() {
  const versions = [
    ['Add a gift option at checkout', 'Today, 2:14 PM', true],
    ['Show orders newest first', 'Yesterday', false],
    ['A page to pick roast, grind and day', 'Nov 16', false],
    ['Start', 'Nov 16', false],
  ] as const;
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Versions</span></div>
      {versions.map(([what, when, now]) => (
        <div key={what} className="os-row">
          <span><strong>{what}</strong><br /><span className="os-muted">{when}{now ? ' · current' : ''}</span></span>
          {now ? null : <span className="a-btn">Restore</span>}
        </div>
      ))}
    </div>
  );
}

// ---- Market ----

export function PostPickerPreview() {
  const options = [
    { text: 'The beans in your next bag were still green on Monday. That’s the point.', picked: true },
    { text: 'Three ways to brew our Colombia this weekend, from easiest to fussiest.', picked: false },
    { text: '“Roasted to order” means we don’t roast until you’ve ordered. Here’s why.', picked: false },
  ];
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">This week · Instagram</span><PlatformIcon platform="instagram" size={12} /></div>
      {options.map((o) => (
        <div key={o.text} className={`os-option${o.picked ? ' on' : ''}`}>
          <span>{o.text}</span>
          {o.picked ? <span className="a-pill sched">Picked</span> : <span className="a-btn">Pick</span>}
        </div>
      ))}
    </div>
  );
}

export function AssistantPreview() {
  return (
    <div className="os-pad os-stack">
      <span className="os-you">Give me three posts for the holiday gift box.</span>
      <span className="os-agent">Here are three. The first leads with the price, the second with the story behind the blend, the third with a gift deadline.</span>
      <div className="os-chips"><span>Use the first</span><span>Shorter</span><span>Make an image</span></div>
    </div>
  );
}

export function PostImagePreview() {
  return (
    <div className="os-pad os-stack">
      <div className="os-post-img" style={{ background: TIDE.brand }}>
        <span className="os-post-kicker">Holiday gift box</span>
        <strong>Three roasts. One very good morning.</strong>
        <span>$45 · ships by Dec 18</span>
      </div>
      <div className="os-head"><span className="os-muted">In your colours, sized for each platform</span><span className="a-btn primary">Schedule</span></div>
    </div>
  );
}

// ---- Money ----

const MONTHS = [38, 46, 41, 55, 61, 58, 66, 72];

export function MoneyMonthPreview() {
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Money · November</span><span className="a-pill good">Stripe connected</span></div>
      <div className="os-total"><strong>$1,856</strong><span className="up">↑ 18% on October</span></div>
      <div className="os-bars" aria-hidden="true">{MONTHS.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
      <div className="os-row"><span className="os-muted">Subscriptions</span><strong>$1,504</strong></div>
      <div className="os-row"><span className="os-muted">Sales</span><strong>$288</strong></div>
      <div className="os-row"><span className="os-muted">Farmers market (added by hand)</span><strong>$64</strong></div>
    </div>
  );
}

export function MoneyAddPreview() {
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">Add money in or out</span></div>
      <div className="os-field"><span className="a-label">What</span><span>Farmers market, Saturday</span></div>
      <div className="os-three" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="os-field"><span className="a-label">Amount</span><span>$64.00</span></div>
        <div className="os-field"><span className="a-label">Type</span><span>Money in</span></div>
      </div>
      <span className="a-btn primary" style={{ justifySelf: 'start' }}>Add</span>
    </div>
  );
}

export function MoneyWeekPreview() {
  return (
    <div className="os-pad os-stack">
      <div className="os-head"><span className="a-label">This week</span></div>
      <div className="os-row"><span>Came in this week</span><strong>$468</strong></div>
      <div className="os-row"><span>Your usual week</span><strong>$410</strong></div>
      <div className="os-row"><span>Posts this week</span><strong>3 published</strong></div>
      <span className="up">↑ A better week than usual</span>
    </div>
  );
}

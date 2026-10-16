import Link from 'next/link';
import { CopyCommand } from '../components/copy-command';
import { LoopTabs } from '../components/loop-tabs';
import { PlatformIcon } from '../components/platform-icon';
import { ApprovalsPreview } from '../components/previews/approvals';
import { Reveal } from '../components/reveal';
import { CtaBand, GitHubButton, SectionHead, Window } from '../components/ui';
import { CLONE, FEATURES, PLATFORMS, PLATFORM_NAME, SITE } from '../lib/site';
import { PRICING } from '../lib/pricing';
import { JsonLd, softwareApplication } from '../lib/jsonld';
import type { Metadata } from 'next';
import { pageMeta } from '../lib/seo';

const BRANDS = [
  { name: 'Harbor', kind: 'Open-source SaaS', voice: 'Personal · data-led · candid', best: 'Tue 9am on X', median: '2.9K', change: '+22%' },
  { name: 'Tidewater Coffee', kind: 'Small-batch roaster', voice: 'Warm · story-led · playful', best: 'Sun 7pm on Instagram', median: '3.2K', change: '+26%' },
  { name: 'Fieldnotes', kind: 'Newsletter', voice: 'Calm · considered · polished', best: 'Wed 8am on LinkedIn', median: '1.4K', change: 'flat' },
];

export const metadata: Metadata = pageMeta('/', { description: SITE.description });

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplication} />
      {/* Hero */}
      <section className="section hero" style={{ paddingBottom: 0 }}>
        <div className="container stack" style={{ gap: 28 }}>
          <Reveal><span className="eyebrow"><span className="pixels" />For builders with more than one brand</span></Reveal>
          <Reveal delay={60}><h1 className="display" style={{ maxWidth: '12ch' }}>The content strategist for builders.</h1></Reveal>
          <Reveal delay={120}>
            <p className="lede" style={{ margin: 0, maxWidth: '50ch' }}>
              Harbor remembers how each of your brands sounds, plans the week from what actually worked, drafts it for every platform and waits for your OK.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="row">
              <Link className="btn primary" href={SITE.start}>Get started</Link>
              <Link className="btn" href="/product">See how it works</Link>
            </div>
          </Reveal>
        </div>
        <div className="container" style={{ marginTop: 'clamp(48px, 7vw, 88px)' }}>
          <Reveal delay={240}>
            <div className="hero-stage gridlines">
              <Window title="Approvals · 3 waiting" className="hero-window"><ApprovalsPreview /></Window>
              <div className="float-chip c-pink" style={{ top: '14%', left: '2%' }}><span className="swatch" />Voice: personal, data-led</div>
              <div className="float-chip c-violet" style={{ top: '46%', right: '1%', animationDelay: '-2s' }}><span className="swatch" />Best slot: Tue 9am</div>
              <div className="float-chip c-yellow" style={{ bottom: '12%', left: '4%', animationDelay: '-4s' }}><span className="swatch" />↑ 2.4× your median</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Platforms */}
      <section className="section tight" style={{ paddingTop: 'clamp(40px, 6vw, 72px)' }}>
        <div className="container stack" style={{ gap: 20 }}>
          <span className="label" style={{ textAlign: 'center' }}>Publishes directly to · no middleman</span>
          <div className="marquee" aria-label="X, LinkedIn, Instagram and Threads">
            <div className="marquee-track">
              {[0, 1, 2, 3].flatMap((r) => PLATFORMS.map((p) => (
                <span key={`${r}${p}`} className="row" style={{ gap: 12, fontSize: 28, letterSpacing: '-0.03em', color: 'var(--muted)' }} aria-hidden={r > 0}>
                  <PlatformIcon platform={p} size={26} />{PLATFORM_NAME[p]}
                </span>
              )))}
            </div>
          </div>
        </div>
      </section>

      {/* Facts */}
      <section className="container">
        <Reveal>
          <div className="stats">
            <div><strong>5</strong><span className="label">checkpoints per post · 1h 6h 24h 3d 7d</span></div>
            <div><strong>4</strong><span className="label">platforms, published direct</span></div>
            <div><strong>0</strong><span className="label">posts sent without your OK</span></div>
            <div><strong>100%</strong><span className="label">open source · self-host free</span></div>
          </div>
        </Reveal>
      </section>

      {/* The loop */}
      <section className="section">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead
            eyebrow="How it works"
            title="Not a scheduler. A strategist that learns."
            lede="Most social tools stop once the post is out. Harbor starts there: every result feeds the next plan, for each brand you run."
          />
          <LoopTabs />
        </div>
      </section>

      {/* Multi-brand */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead
            eyebrow="Built for more than one brand"
            title="Every brand sounds like itself."
            lede="A product, a side project, your own name. Each brand has its own voice, best times and baseline, so a win on one never skews the other."
          />
          <div className="cards">
            {BRANDS.map((b, i) => (
              <Reveal key={b.name} delay={i * 80} className="card brand-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em' }}>{b.name}</strong>
                  <span className="tag">{b.kind}</span>
                </div>
                <dl className="kv">
                  <div><dt className="label">Voice</dt><dd>{b.voice}</dd></div>
                  <div><dt className="label">Best time</dt><dd>{b.best}</dd></div>
                  <div><dt className="label">Median at 24h</dt><dd><span className="mono">{b.median}</span> <span className="dim small">{b.change} vs last week</span></dd></div>
                </dl>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="The platform" title="Five pieces, one loop." />
          <div className="cards">
            {FEATURES.map((f, i) => (
              <Reveal key={f.slug} delay={i * 60}>
                <Link href={f.href} className={`card feature-card c-${f.color}`} style={{ height: '100%' }}>
                  <span className="mono small ink-c">{String(i + 1).padStart(2, '0')}</span>
                  <strong style={{ fontWeight: 500, fontSize: 22, letterSpacing: '-0.02em' }}>{f.name}</strong>
                  <span className="muted">{f.short}</span>
                  <span className="link-arrow" style={{ marginTop: 'auto' }}>Learn more →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Developers */}
      <section className="section rule">
        <div className="container split">
          <SectionHead
            eyebrow="For agents, too"
            title="Let Claude work in Harbor."
            lede="Harbor ships an MCP server. Any agent can read Brand Memory, check best times, draft and propose posts. Proposals land in Approvals like everything else."
          />
          <Reveal delay={120}>
            <div className="terminal">
              <div className="window-bar" style={{ background: 'var(--raised)', color: 'var(--dim)', borderColor: 'var(--line)' }}><i /><i /><i /><span className="grow">terminal</span><span style={{ width: 39 }} /></div>
              <pre>{`$ claude mcp add --transport http harbor \\
    https://your-harbor/mcp \\
    --header "Authorization: Bearer hbr_…"

> Plan next week for Tidewater Coffee

  ✓ get_brand_memory   Tidewater Coffee
  ✓ best_times         Sun 7pm, Tue 9am, Thu 1pm
  ✓ suggest_ideas      3 ideas from last week's winners
  ✓ draft_idea         Instagram, Threads
  ✓ propose_post       3 posts → waiting in Approvals`}</pre>
            </div>
            <div className="row" style={{ marginTop: 16 }}><Link className="link-arrow" href="/developers">MCP tools and API →</Link></div>
          </Reveal>
        </div>
      </section>

      {/* Open source */}
      <section className="section rule">
        <div className="container split">
          <Reveal>
            <div className="stack" style={{ gap: 20 }}>
              <span className="eyebrow"><span className="pixels" />Open source</span>
              <h2 className="h2">Your content, your data, your server.</h2>
              <p className="lede" style={{ margin: 0 }}>Harbor is AGPL-licensed. Run it on your laptop in sandbox mode with no keys and no spend, then connect your own platform apps when you’re ready.</p>
              <ul className="check-list">
                <li>Sandbox publishing and a built-in model: try everything for free</li>
                <li>Postgres, or an embedded database for local use</li>
                <li>Your own platform developer apps; tokens encrypted at rest</li>
              </ul>
              <div className="row"><GitHubButton /><Link className="btn" href="/open-source">Self-host guide</Link></div>
              <CopyCommand command={CLONE} display="git clone github.com/tryharbor/harbor" />
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="terminal">
              <div className="window-bar" style={{ background: 'var(--raised)', color: 'var(--dim)', borderColor: 'var(--line)' }}><i /><i /><i /><span className="grow">~/harbor</span><span style={{ width: 39 }} /></div>
              <pre>{`$ git clone https://github.com/tryharbor/harbor
$ cd harbor && pnpm install
$ pnpm dev

  Harbor API on http://localhost:4800
  publishing: sandbox · model: simulated
  Harbor on   http://localhost:4801  ✓`}</pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Pricing" title="Priced per brand, not per seat." lede="Self-hosting is free forever. Harbor Cloud is opening soon at early pricing." />
          <div className="cards">
            {PRICING.map((p, i) => (
              <Reveal key={p.name} delay={i * 60} className="card">
                <span className="label">{p.name}</span>
                <strong style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.04em' }}>{p.price}<span className="small dim" style={{ letterSpacing: 0 }}>{p.per}</span></strong>
                <span className="muted small">{p.brands}</span>
              </Reveal>
            ))}
          </div>
          <Link className="link-arrow" href="/pricing">Compare plans →</Link>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

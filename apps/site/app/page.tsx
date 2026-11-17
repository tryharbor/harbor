import Link from 'next/link';
import type { Metadata } from 'next';
import { BusinessPreview } from '../components/previews/business';
import { Reveal } from '../components/reveal';
import { CtaBand, SectionHead, Window } from '../components/ui';
import { JsonLd, softwareApplication } from '../lib/jsonld';
import { getGuides } from '../lib/guides';
import { PRICING } from '../lib/pricing';
import { pageMeta } from '../lib/seo';
import { SITE } from '../lib/site';
import './home.css';

export const metadata: Metadata = pageMeta('/', { description: SITE.description });

/** Real businesses and the real thing Harbor makes for them (docs/marketing/copy-guide.md, rule 4). */
const EXAMPLES = [
  { what: 'A booking page for a dog groomer', kind: 'Website' },
  { what: 'An order form for a coffee roaster', kind: 'Website' },
  { what: 'A members area for a yoga coach', kind: 'App' },
  { what: 'A client portal for a bookkeeper', kind: 'App' },
  { what: 'A quote request page for a landscaper', kind: 'Website' },
  { what: 'A course with paid sign-up for a baker', kind: 'App' },
];

const VERBS = [
  { verb: 'Build.', color: 'pink', title: 'Your website, or the product itself.', body: 'Tell Harbor about your business and get a website that gets you booked. When the product is software, describe it in plain words and watch it come together.' },
  { verb: 'Sell.', color: 'violet', title: 'Posts that sound like you.', body: 'Ask for this week’s posts and pick the ones you like. They already know your offer, your customers and your prices.' },
  { verb: 'Get paid.', color: 'yellow', title: 'Money coming in, at a glance.', body: 'Take payments in your app and see what came in this month next to everything else. No spreadsheet.' },
] as const;

const FAQ = [
  { q: 'Do I need to know how to code?', a: 'No. You describe what you want in plain words and see it working as you go. If you ever want the code, it’s yours.' },
  { q: 'Website or app: which do I need?', a: 'If you sell a service or a few products, start with a website: it’s ready in minutes. If the product is software, or you need accounts, members or your own features, build an app. You can do both.' },
  { q: 'Does Harbor post for me?', a: 'Harbor writes the posts and you choose. Nothing goes out until you’ve picked it.' },
  { q: 'Which AI does it use?', a: 'Your pick of Claude, ChatGPT or Gemini. Use Harbor’s, or bring your own account.' },
];

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplication} />

      {/* Hero */}
      <section className="section hero" style={{ paddingBottom: 0 }}>
        <div className="container stack" style={{ gap: 28 }}>
          <Reveal><span className="eyebrow"><span className="pixels" />For people starting something</span></Reveal>
          <Reveal delay={60}><h1 className="display" style={{ maxWidth: '11ch' }}>Build it. Sell it. See it pay.</h1></Reveal>
          <Reveal delay={120}>
            <p className="lede" style={{ margin: 0, maxWidth: '50ch' }}>
              Describe your business once. Harbor builds your website or app, writes your posts, and shows you the money coming in.
            </p>
          </Reveal>
          <Reveal delay={180}>
            <div className="row">
              <Link className="btn primary" href={SITE.start}>Get early access</Link>
              <Link className="btn" href="/pricing">See pricing</Link>
            </div>
          </Reveal>
        </div>
        <div className="container" style={{ marginTop: 'clamp(48px, 7vw, 88px)' }}>
          <Reveal delay={240}>
            <div className="hero-stage gridlines">
              <Window title="Tidewater Coffee" className="hero-window"><BusinessPreview /></Window>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Examples */}
      <section className="section">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="What people make" title="Whatever your business runs on." lede="A page that gets you booked, or the app your customers sign in to. Here’s the kind of thing Harbor builds." />
          <div className="examples">
            {EXAMPLES.map((e, i) => (
              <Reveal key={e.what} delay={i * 50} className="example">
                <span className="tag">{e.kind}</span>
                <strong>{e.what}</strong>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Build, sell, get paid */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="One place" title="Everything after the idea." lede="Most tools stop when your site goes live. That’s where the work starts: finding customers and getting paid. Harbor does all three." />
          <div className="cards">
            {VERBS.map((v, i) => (
              <Reveal key={v.verb} delay={i * 80} className={`card verb-card c-${v.color}`}>
                <span className="verb ink-c">{v.verb}</span>
                <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em' }}>{v.title}</strong>
                <span className="muted">{v.body}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Website or app */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Website or app" title="Start with what you need today." />
          <Reveal>
            <div className="choose">
              <div>
                <span className="label">Website</span>
                <span className="line">Get online and get booked.</span>
                <span className="muted">For service businesses and small shops. Pick from three designs, change any word, and you’re live, with a contact form that sends you every enquiry.</span>
              </div>
              <div>
                <span className="label">App</span>
                <span className="line">Build the product itself.</span>
                <span className="muted">For when the product is software. Customer accounts, payments and your own features, built from your description and yours to keep.</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* What it replaces */}
      <section className="section rule">
        <div className="container split">
          <SectionHead eyebrow="Fewer tools" title="One place instead of five." lede="A new business usually means a website builder, someone to build the app, a social scheduler, an AI writer and a spreadsheet for the money. And you typing the same details into each." />
          <Reveal delay={120}>
            <div className="replaces">
              <span>Website builder</span>
              <span>App developer</span>
              <span>Social scheduler</span>
              <span>AI writer</span>
              <span>Money spreadsheet</span>
              <span className="into">Harbor</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Guides */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Guides" title="Starting out? Start here." lede="What it really costs, what to charge, and how to find your first customers, with every number sourced and kept up to date." />
          <div className="cards">
            {getGuides().filter((g) => g.kind === 'start' || g.kind === 'general').map((g, i) => (
              <Reveal key={g.slug} delay={i * 60}>
                <Link href={`/guides/${g.slug}`} className="card" style={{ height: '100%' }}>
                  <strong style={{ fontWeight: 500, fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1.25 }}>{g.title}</strong>
                  <span className="muted small">{g.description}</span>
                  <span className="link-arrow" style={{ marginTop: 'auto' }}>Read the guide →</span>
                </Link>
              </Reveal>
            ))}
          </div>
          <Link className="link-arrow" href="/guides">All guides →</Link>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 40 }}>
          <SectionHead eyebrow="Pricing" title="One price for the whole business." lede="Opening soon at early pricing." />
          <div className="cards">
            {PRICING.map((p, i) => (
              <Reveal key={p.name} delay={i * 60} className="card">
                <span className="label">{p.name}</span>
                <strong style={{ fontSize: 40, fontWeight: 400, letterSpacing: '-0.04em' }}>{p.price}<span className="small dim" style={{ letterSpacing: 0 }}>{p.per}</span></strong>
                <span className="muted small">{p.summary} {p.limit}</span>
              </Reveal>
            ))}
          </div>
          <Link className="link-arrow" href="/pricing">Compare plans →</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="section rule">
        <div className="container split" style={{ alignItems: 'start' }}>
          <SectionHead eyebrow="Questions" title="The short answers." />
          <Reveal delay={100}>
            <div className="home-faq">
              {FAQ.map((f) => (
                <details key={f.q} name="home-faq">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Your business, up and running." lede="Get early access. We’ll email you when your plan is ready." />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '../../components/code-block';
import { CopyCommand } from '../../components/copy-command';
import { Reveal } from '../../components/reveal';
import { CtaBand, GitHubButton, PageHero, SectionHead } from '../../components/ui';
import { CLONE, SITE } from '../../lib/site';
import { Architecture } from './architecture';
import './open-source.css';

export const metadata: Metadata = {
  title: 'Open source',
  description: 'Harbor is open source under the AGPL. What the license lets you do, how to self-host Harbor in sandbox mode, connect your own platform apps and run it on Postgres.',
  alternates: { canonical: '/open-source' },
};

const DOCS = `${SITE.github}/blob/main/docs/setup/platform-apps.md`;

const STEPS = [
  {
    n: '01',
    title: 'Clone the repo',
    body: <p>You need Node 22.12 or newer and pnpm 10.</p>,
    code: { title: '~', text: 'git clone https://github.com/tryharbor/harbor\ncd harbor' },
  },
  {
    n: '02',
    title: 'Install',
    body: <p>One install for the whole monorepo: the web app, the API and the shared packages.</p>,
    code: { title: '~/harbor', text: 'pnpm install' },
  },
  {
    n: '03',
    title: 'Run it in sandbox mode',
    body: (
      <>
        <p>With no <code>.env</code> at all, Harbor runs fully offline. Publishing is simulated per platform with each platform’s real limits, and drafting uses a deterministic simulated model. No keys, no network calls, no spend.</p>
        <p>Want sample data? <code>pnpm --filter @harbor/api dev:demo</code> plus <code>pnpm dev:web</code> starts two demo brands with six weeks of posts and growth curves, on a separate database.</p>
      </>
    ),
    code: { title: '~/harbor', text: 'pnpm dev\n\n# API  http://localhost:4800\n#      pglite; publishing: sandbox; model: simulated\n# Web  http://localhost:4801' },
  },
  {
    n: '04',
    title: 'Fill in .env when you go live',
    body: (
      <>
        <p>Copy the example file. The keys that matter first:</p>
        <ul className="check-list">
          <li><span><code>HARBOR_PUBLISH_MODE=live</code> to post for real.</span></li>
          <li><span><code>HARBOR_SECRET_KEY</code> encrypts every account token. Generate it with <code>openssl rand -base64 32</code> and keep it: lose it and you reconnect every account.</span></li>
          <li><span><code>HARBOR_API_URL</code> is the API’s public HTTPS address. Redirect URLs are built from it.</span></li>
          <li><span>One client ID and secret per platform: <code>X_</code>, <code>LINKEDIN_</code>, <code>INSTAGRAM_</code>, <code>THREADS_</code>.</span></li>
        </ul>
      </>
    ),
    code: { title: '.env', text: 'cp .env.example .env\n\nHARBOR_PUBLISH_MODE=live\nHARBOR_SECRET_KEY=   # openssl rand -base64 32\nHARBOR_API_URL=https://your-name.ngrok-free.app\nX_CLIENT_ID=\nX_CLIENT_SECRET=\nLINKEDIN_CLIENT_ID=\nLINKEDIN_CLIENT_SECRET=\nINSTAGRAM_APP_ID=\nINSTAGRAM_APP_SECRET=\nTHREADS_APP_ID=\nTHREADS_APP_SECRET=' },
  },
];

const PLATFORMS = [
  { name: 'X', color: 'pink', items: ['OAuth 2.0 Web App (confidential client), read and write', 'Pay-per-use: add credits and set a spending limit', 'Images work; video isn’t supported yet'] },
  { name: 'LinkedIn', color: 'violet', items: ['Add “Share on LinkedIn” and “Sign In with LinkedIn using OpenID Connect”, both self-serve', 'Needs a Company Page to own the app; it still posts as you', 'Tokens last 60 days; post metrics need partner approval, so they show n/a'] },
  { name: 'Instagram', color: 'coral', items: ['Instagram API with Instagram Login; a Business or Creator account, no Facebook Page', 'Add yourself as an Instagram tester and keep the app in development mode', 'Every post needs an image or video at a public URL'] },
  { name: 'Threads', color: 'amber', items: ['Add the Threads API use case to a Meta app', 'Add your profile as a Threads tester and accept the invite', '500 characters a post; tokens refresh on their own'] },
] as const;

export default function OpenSourcePage() {
  return (
    <>
      <PageHero
        eyebrow="Open source · AGPL"
        title="Your server, your data, your Harbor."
        lede="Every feature of Harbor is in the public repo. Run it on your laptop in sandbox mode in a few minutes, then connect your own accounts when you’re ready."
        actions={<><GitHubButton /><CopyCommand command={CLONE} display="git clone github.com/tryharbor/harbor" /></>}
      />

      {/* AGPL */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="The license" title="The AGPL, in plain words." lede="Harbor is licensed under the GNU Affero General Public License v3. Most people never need to think about it. Here’s when you do." />
          <div className="os-license">
            <Reveal className="card">
              <span className="label">You can</span>
              <ul className="check-list">
                <li>Use Harbor for anything, including commercial work and clients’ brands</li>
                <li>Run it on your own server, for as many brands as you like, for free</li>
                <li>Read, change and fork the code</li>
                <li>Charge for setting it up, hosting it or supporting it</li>
                <li>Keep private changes private when only you and your own team use them</li>
              </ul>
            </Reveal>
            <Reveal delay={100} className="card">
              <span className="label">If you host a modified Harbor for others</span>
              <ul className="check-list c-violet">
                <li>Offer the people using it the complete source of your modified version, for example with a link in the app</li>
                <li>License your changes under the AGPL too</li>
                <li>Keep the copyright and license notices</li>
                <li>Say that you changed it, and roughly when</li>
              </ul>
              <p className="dim small" style={{ margin: 0 }}>“Others” means people outside your organization who use it over the network: clients logging in, or a hosted service you sell.</p>
            </Reveal>
          </div>
          <Reveal>
            <p className="dim small" style={{ margin: 0, maxWidth: '72ch' }}>
              A plain summary, not legal advice. The <a className="os-link" href={`${SITE.github}/blob/main/LICENSE`}>LICENSE</a> file is what counts. Why the AGPL: if someone turns Harbor into a hosted service, the improvements come back to everyone, including you.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Guide */}
      <section className="section rule" id="guide">
        <div className="container stack" style={{ gap: 56 }}>
          <SectionHead eyebrow="Self-host guide" title="From clone to first post." lede="Sandbox first, so you can see everything working before you touch a developer console." />
          <ol className="os-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <Reveal className="os-step">
                  <div className="os-step-text">
                    <span className="mono small os-step-n">{s.n}</span>
                    <h3 className="h3">{s.title}</h3>
                    <div className="os-step-body">{s.body}</div>
                  </div>
                  <CodeBlock title={s.code.title} code={s.code.text} />
                </Reveal>
              </li>
            ))}
            <li>
              <Reveal className="os-step os-step-wide">
                <div className="os-step-text">
                  <span className="mono small os-step-n">05</span>
                  <h3 className="h3">Connect your platform apps</h3>
                  <div className="os-step-body">
                    <p>Harbor publishes through developer apps you register yourself, one per platform. For your own accounts none of them need app review: you only connect accounts that hold a role on the app. Allow about an hour for all four.</p>
                    <p>Meta only accepts HTTPS redirect URLs, so while developing, point a tunnel with a stable address at <code>localhost:4800</code> (an ngrok static domain or a Cloudflare named tunnel) and use it as <code>HARBOR_API_URL</code>. Each platform’s redirect URL is <code>{'{HARBOR_API_URL}'}/v1/channels/{'{platform}'}/callback</code>.</p>
                  </div>
                </div>
                <div className="os-platforms">
                  {PLATFORMS.map((p, i) => (
                    <Reveal key={p.name} delay={i * 70} className={`card c-${p.color}`}>
                      <span className="eyebrow"><span className="swatch" />{p.name}</span>
                      <ul className="check-list">{p.items.map((it) => <li key={it}>{it}</li>)}</ul>
                    </Reveal>
                  ))}
                </div>
                <div className="row">
                  <a className="btn" href={DOCS}>Full platform setup guide</a>
                  <span className="dim small">docs/setup/platform-apps.md in the repo, with every scope and dashboard step</span>
                </div>
              </Reveal>
            </li>
            <li>
              <Reveal className="os-step">
                <div className="os-step-text">
                  <span className="mono small os-step-n">06</span>
                  <h3 className="h3">Use Postgres in production</h3>
                  <div className="os-step-body">
                    <p>With <code>DATABASE_URL</code> unset, the API uses PGlite, an embedded Postgres stored under <code>apps/api/.pglite</code>. Good for a laptop; it lives in one process.</p>
                    <p>For a server, set <code>DATABASE_URL</code> to any <code>postgres://</code> URL, for example Supabase (transaction poolers work). Same SQL either way, and migrations run when the API starts.</p>
                  </div>
                </div>
                <CodeBlock title=".env" code={'# Unset: embedded PGlite under apps/api/.pglite\nDATABASE_URL=postgres://user:pass@host:5432/harbor'} />
              </Reveal>
            </li>
          </ol>
        </div>
      </section>

      {/* Architecture */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="Architecture" title="Two apps and a database." lede="A Next.js app for people, a Hono API for everything else. The API’s worker runs in the same process, and its state lives in Postgres rows, so PGlite works too." />
          <Reveal><Architecture /></Reveal>
          <div className="cards">
            {[
              { t: 'packages/core', d: 'Domain types and schemas, normalized metrics per platform, and the publishing interface with its failure policy.' },
              { t: 'packages/providers', d: 'One adapter per platform for OAuth, publishing, threads, metrics and replies, plus a sandbox for each.' },
              { t: 'packages/ai', d: 'The content model interface, with the simulated model as the default.' },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 60} className="card">
                <code className="os-pkg">{c.t}</code>
                <span className="muted">{c.d}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Cloud */}
      <section className="section rule">
        <div className="container split">
          <SectionHead eyebrow="Harbor Cloud · coming soon" title="Same Harbor, without the server." lede="Cloud runs the same open-source code. It’s for people who would rather not run infrastructure or register four developer apps." />
          <Reveal delay={100}>
            <div className="os-cloud">
              {[
                { t: 'Hosting', d: 'We run the API, the worker and the web app, and keep them updated.' },
                { t: 'Backups', d: 'Database and media library backed up, so a lost laptop isn’t a lost history.' },
                { t: 'No developer apps', d: 'Connect accounts through Harbor’s own platform apps. No consoles, tunnels or tester invites.' },
                { t: 'Opening soon', d: 'Cloud needs platform app review before it can open. Early pricing is on the pricing page.' },
              ].map((c) => (
                <div key={c.t}>
                  <strong>{c.t}</strong>
                  <span className="muted">{c.d}</span>
                </div>
              ))}
              <div className="row" style={{ paddingTop: 8, borderTop: 0 }}><Link className="btn primary" href="/pricing">See Cloud pricing</Link></div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Contributing */}
      <section className="section rule">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="Contributing" title="Built in public. Help welcome." lede="Harbor is early, and the most useful contributions right now are bug reports from real use and fixes for the platforms you post to." />
          <div className="cards">
            {[
              { n: '01', t: 'Open an issue first', d: 'For anything bigger than a typo, describe the problem in a GitHub issue before writing code, so we can agree on the shape.' },
              { n: '02', t: 'Keep the sandbox working', d: 'Everything must run with no keys and no network. New platform features need a sandbox version and tests with mocked HTTP.' },
              { n: '03', t: 'Read the decisions', d: 'docs/decisions explains the rules that won’t change, like publishing directly and agents never posting on their own.' },
              { n: '04', t: 'Check before you push', d: 'Run pnpm test and pnpm typecheck. UI follows docs/design/DESIGN.md: square controls, no colored edge accents, no native dropdowns.' },
            ].map((c, i) => (
              <Reveal key={c.n} delay={i * 60} className="card">
                <span className="mono small" style={{ color: 'var(--pink)' }}>{c.n}</span>
                <strong className="os-card-title">{c.t}</strong>
                <span className="muted">{c.d}</span>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="muted" style={{ margin: 0 }}>Found a security issue? Please email <a className="os-link" href={`mailto:${SITE.email}`}>{SITE.email}</a> instead of opening a public issue.</p>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Run Harbor on your own machine today." />
    </>
  );
}

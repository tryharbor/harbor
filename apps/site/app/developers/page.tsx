import type { Metadata } from 'next';
import Link from 'next/link';
import { CodeBlock } from '../../components/code-block';
import { Reveal } from '../../components/reveal';
import { CtaBand, PageHero, SectionHead } from '../../components/ui';
import { AGENTS, MCP_TOOLS, type McpTool } from '../../lib/mcp-tools';
import { AgentSession } from './agent-session';
import './developers.css';
import { pageMeta } from '../../lib/seo';

export const metadata: Metadata = pageMeta('/developers', {
  title: 'Developers',
  description: 'Harbor’s MCP server (Streamable HTTP at /mcp, hbr_ API keys, a stdio bridge), its 23 tools with read and write scopes, and the /v1 REST API.',
  alternates: { canonical: '/developers' },
});

const CLAUDE_CODE = `claude mcp add --transport http harbor http://localhost:4800/mcp \\
  --header "Authorization: Bearer hbr_your_key"`;

const CLAUDE_DESKTOP = JSON.stringify(
  { mcpServers: { harbor: { command: 'pnpm', args: ['--dir', '/path/to/harbor/apps/api', 'mcp:stdio'], env: { HARBOR_API_URL: 'http://localhost:4800', HARBOR_API_KEY: 'hbr_your_key' } } } },
  null,
  2,
);

const READ = MCP_TOOLS.filter((t) => t.scope === 'read');
const WRITE = MCP_TOOLS.filter((t) => t.scope === 'write');

const RESOURCES: { name: string; color: 'pink' | 'violet' | 'coral' | 'amber' | 'yellow'; what: string; routes: string[] }[] = [
  { name: 'brands', color: 'pink', what: 'Brands and their Brand Memory: voice, audiences, offers, knowledge.', routes: ['GET /v1/brands', 'POST /v1/brands', 'GET · PATCH · DELETE /v1/brands/:id', 'GET /v1/brands/:id/best-times', 'POST /v1/brands/:id/memory/save', 'POST /v1/brands/:id/memory/preview'] },
  { name: 'ideas', color: 'pink', what: 'The Idea → Drafting → Approved → Scheduled → Live pipeline.', routes: ['GET · POST /v1/ideas', 'POST /v1/ideas/generate', 'PATCH · DELETE /v1/ideas/:id'] },
  { name: 'drafts', color: 'coral', what: 'Per-platform drafts with versions, generation and rewrites.', routes: ['GET · POST /v1/drafts', 'GET /v1/drafts/:id', 'POST /v1/drafts/generate', 'POST /v1/drafts/:id/rewrite'] },
  { name: 'posts', color: 'amber', what: 'Publish now or schedule, with metrics, verdicts and replies.', routes: ['GET · POST /v1/posts', 'GET · PATCH · DELETE /v1/posts/:id', 'POST /v1/posts/:id/resolve', 'GET /v1/posts/:id/replies'] },
  { name: 'approvals', color: 'violet', what: 'What agents proposed: approve, edit, reject, or do it in bulk.', routes: ['GET /v1/approvals', 'POST /v1/approvals/:id/approve', 'POST /v1/approvals/:id/reject', 'POST /v1/approvals/bulk'] },
  { name: 'agents', color: 'violet', what: 'The built-in agents and their runs, step by step.', routes: ['GET /v1/agents', 'GET /v1/agents/:id', 'POST /v1/agents/:id/runs', 'GET /v1/agent-runs/:id'] },
  { name: 'automations', color: 'violet', what: 'Agents on a schedule or after a post event, with a daily cap.', routes: ['GET · POST /v1/automations', 'GET · PATCH · DELETE /v1/automations/:id', 'POST /v1/automations/:id/run'] },
  { name: 'insights', color: 'yellow', what: 'Verdicts against the median, digests and the cross-brand overview.', routes: ['GET /v1/insights/overview', 'GET · POST /v1/brands/:id/digest', 'POST /v1/brands/:id/outcomes', 'GET /v1/brands/:id/signals'] },
  { name: 'media', color: 'coral', what: 'Uploads, focal points and per-platform crops at public URLs.', routes: ['GET · POST /v1/brands/:id/media', 'POST /v1/brands/:id/media/from-url', 'GET · PATCH · DELETE /v1/media/:id', 'GET /v1/media/:id/fit'] },
];

function ToolList({ tools, scope }: { tools: McpTool[]; scope: 'read' | 'write' }) {
  return (
    <div className="dev-tools">
      <div className="dev-tools-head">
        <span className={`dev-scope ${scope}`}>{scope}</span>
        <span className="label">{tools.length} tools · needs the “{scope}” scope</span>
      </div>
      <ul>
        {tools.map((t, i) => (
          <Reveal as="li" key={t.name} delay={Math.min(i, 8) * 30}>
            <code className="dev-tool-name">{t.name}<span>({t.args ? `{ ${t.args} }` : ''})</span></code>
            <p>{t.description}</p>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title="Give your agent a seat in Harbor."
        lede="Harbor ships an MCP server, so Claude or any MCP client can read Brand Memory, check best times, draft and propose posts. Proposals wait in Approvals like everything else."
        actions={<><a className="btn primary" href="#mcp">MCP server</a><a className="btn" href="#api">REST API</a><a className="btn" href="#keys">API keys</a></>}
      />

      {/* MCP */}
      <section className="section rule" id="mcp">
        <div className="container stack" style={{ gap: 56 }}>
          <div className="split" style={{ alignItems: 'start' }}>
            <div className="stack" style={{ gap: 28 }}>
              <SectionHead eyebrow="MCP server" color="violet" title="One endpoint, 23 tools." />
              <Reveal delay={60}>
                <dl className="dev-facts">
                  <div><dt className="label">Endpoint</dt><dd><code>POST /mcp</code> on the Harbor API, over Streamable HTTP. Stateless: every request stands alone, so there are no sessions to keep alive.</dd></div>
                  <div><dt className="label">Auth</dt><dd><code>Authorization: Bearer hbr_…</code>. Create a key in Harbor under Settings → API keys.</dd></div>
                  <div><dt className="label">stdio</dt><dd>For clients that only speak stdio, <code>pnpm --dir apps/api mcp:stdio</code> relays every message to <code>/mcp</code> with <code>HARBOR_API_URL</code> and <code>HARBOR_API_KEY</code>. Keep the API running while you use it.</dd></div>
                  <div><dt className="label">Resource</dt><dd><code>harbor://brands/{'{brandId}'}/memory</code>: a brand’s Brand Memory as JSON.</dd></div>
                  <div><dt className="label">Results</dt><dd>Every tool result says which mode Harbor runs in, like <code>(sandbox · simulated model)</code>, so an agent knows when nothing is real.</dd></div>
                </dl>
              </Reveal>
            </div>
            <Reveal delay={120}><AgentSession /></Reveal>
          </div>

          <div className="dev-snippets">
            <Reveal className="stack" >
              <span className="label">Claude Code</span>
              <CodeBlock title="terminal" code={CLAUDE_CODE} />
            </Reveal>
            <Reveal delay={80} className="stack">
              <span className="label">Claude Desktop and other stdio clients</span>
              <CodeBlock title="claude_desktop_config.json" code={CLAUDE_DESKTOP} />
            </Reveal>
          </div>
          <Reveal><p className="dim small" style={{ margin: 0 }}>Harbor’s Settings → API keys page shows these same snippets with your API’s real URL, the path to your checkout and a freshly created key filled in.</p></Reveal>
        </div>
      </section>

      {/* Agents propose, people publish */}
      <section className="section tight">
        <div className="container">
          <Reveal>
            <div className="dev-rule dots">
              <span className="eyebrow"><span className="pixels" />Decision 0003</span>
              <h2 className="h2" style={{ maxWidth: '16ch' }}>Agents propose, people publish.</h2>
              <div className="dev-rule-grid">
                <p>There is a <code>propose_post</code> tool. There is no <code>schedule_post</code> and no <code>publish</code>.</p>
                <p>The <code>write</code> scope stops at proposing: an approval with the draft, the account, a slot, the reason and the voice-check results.</p>
                <p>A person approves, edits or rejects it in Harbor. Every MCP run is recorded with its source and the key that made it.</p>
              </div>
              <Link className="link-arrow" href="/blog/why-harbor-never-posts-without-you">Why Harbor never posts without you →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Tools */}
      <section className="section rule" id="tools">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="Tools" title="Everything an agent can do." lede="The full list, as the server defines it. Read tools look; write tools create ideas, drafts, notes and proposals." />
          <div className="dev-tool-grid">
            <ToolList tools={READ} scope="read" />
            <ToolList tools={WRITE} scope="write" />
          </div>
          <div className="stack" style={{ gap: 20 }}>
            <Reveal><span className="label">Agents run_agent can start</span></Reveal>
            <div className="cards">
              {AGENTS.map((a, i) => (
                <Reveal key={a.id} delay={i * 50} className="card">
                  <code className="dev-agent-id">{a.id}</code>
                  <strong style={{ fontWeight: 500 }}>{a.name}</strong>
                  <span className="muted small">{a.does}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* REST */}
      <section className="section rule" id="api">
        <div className="container stack" style={{ gap: 48 }}>
          <SectionHead eyebrow="REST API" color="amber" title="The API the app is built on." lede="Harbor’s web app is a client of the /v1 API, so anything you can do in the app, you can do with curl. JSON in, JSON out." />
          <div className="split" style={{ alignItems: 'start' }}>
            <Reveal>
              <div className="dev-note">
                <strong>/v1 is local for now.</strong>
                <p>The REST API acts as you, so it can publish. Until Harbor has user accounts, it only answers on the machine it runs on. Requests through a tunnel or a public hostname only reach OAuth callbacks, <code>/media</code>, <code>/mcp</code> and <code>/health</code>. Agents use the MCP server and an API key instead.</p>
                <p className="dim small">Behind your own auth, <code>HARBOR_PUBLIC_API=all</code> turns the gate off.</p>
              </div>
            </Reveal>
            <Reveal delay={80}>
              <CodeBlock title="localhost" code={`curl -X POST localhost:4800/v1/brands \\
  -H 'content-type: application/json' \\
  -d '{"name":"My Brand"}'

# Errors always look like this:
{ "error": { "code": "NOT_FOUND",
             "message": "…",
             "request_id": "…" } }`} />
            </Reveal>
          </div>
          <div className="dev-resources">
            {RESOURCES.map((r, i) => (
              <Reveal key={r.name} delay={(i % 3) * 60} className={`dev-resource c-${r.color}`}>
                <span className="eyebrow"><span className="swatch" /><code>/v1/{r.name}</code></span>
                <p>{r.what}</p>
                <ul>{r.routes.map((x) => <li key={x}><code>{x}</code></li>)}</ul>
              </Reveal>
            ))}
          </div>
          <Reveal><p className="dim small" style={{ margin: 0 }}>Also: channels and the connect flow, campaigns and their canvas, memory proposals, API keys, <code>GET /v1/mode</code> (sandbox or live, simulated or real model) and the sandbox clock. Each response carries a <code>Harbor-Request-Id</code> header. Full reference in the repo README.</p></Reveal>
        </div>
      </section>

      {/* Keys */}
      <section className="section rule" id="keys">
        <div className="container split" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gap: 28 }}>
            <SectionHead eyebrow="API keys" color="pink" title="Two scopes. Neither can publish." />
            <Reveal delay={60}>
              <ul className="check-list">
                <li>A key is <code>hbr_</code> plus 32 random base62 characters.</li>
                <li>Harbor stores only its SHA-256 hash and the first 12 characters, for display. The full key is shown once, when you create it.</li>
                <li>Each key records when it was last used. Revoke one at any time and it stops working immediately.</li>
                <li>A call without the right scope fails with a message saying which scope it needs and which ones the key has.</li>
              </ul>
            </Reveal>
          </div>
          <Reveal delay={120}>
            <div className="dev-scopes">
              <div>
                <span className="dev-scope read">read</span>
                <p>List brands, posts, ideas, campaigns, media, agents and approvals. Read Brand Memory, digests, best times, conversation themes and agent runs.</p>
              </div>
              <div>
                <span className="dev-scope write">write</span>
                <p>Create and suggest ideas, draft them, attach media, add knowledge and canvas notes, save to Brand Memory, run agents and propose posts.</p>
              </div>
              <div>
                <span className="dev-scope none">neither</span>
                <p>Publish, schedule, approve, delete or connect accounts. Those stay with a person in the app.</p>
              </div>
              <CodeBlock title="API keys" copy={false} code={`GET    /v1/api-keys
POST   /v1/api-keys   { "name": "Claude Code", "scopes": ["read", "write"] }
DELETE /v1/api-keys/:id`} />
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand title="Point Claude at your own Harbor." lede="Run Harbor locally in sandbox mode, create a key and connect Claude Code in one command. Nothing it proposes goes out until you approve it." />
    </>
  );
}

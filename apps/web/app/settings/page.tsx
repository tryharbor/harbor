import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { revokeApiKey } from '../agent-actions';
import { API_INTERNAL_URL, API_PUBLIC_URL, getApiKeys, getMcpInfo, getPlatforms, loadAll, type ApiKey, type McpInfo, type PlatformInfo } from '../api';
import { Flash, LoadError, PageHeader, PLATFORM_NAME, when } from '../ui';
import { NewApiKey } from './api-keys';

export const dynamic = 'force-dynamic';

/** The repo's apps/api folder, for the stdio bridge snippet. */
function bridgeDir() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, 'apps/api');
    dir = dirname(dir);
  }
  return '/path/to/harbor/apps/api';
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const s = await searchParams;
  const res = await loadAll<[PlatformInfo[], ApiKey[], McpInfo]>([getPlatforms(), getApiKeys(), getMcpInfo()]);
  if (!res.ok) return (<><PageHeader title="Settings" /><LoadError message={res.error} /></>);
  const [platforms, keys, mcp] = res.data;
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);
  return (
    <>
      <PageHeader title="Settings" sub="How this Harbor install connects to the platforms, and how agents connect to Harbor." />
      <Flash params={s} />
      <section className="stack" id="mcp">
        <div className="stack" style={{ gap: 6 }}>
          <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />MCP server</span>
          <h2 style={{ margin: 0 }}>Let Claude work in Harbor</h2>
          <p className="muted small" style={{ margin: 0, maxWidth: '72ch' }}>
            Any MCP client can read Brand Memory, the digest and best times, suggest ideas, draft and propose posts. It can't publish:
            proposals wait in Approvals like every agent's. Endpoint <code>{mcp.url}</code> ({mcp.transport}).
          </p>
        </div>
        <NewApiKey mcpUrl={mcp.url} bridgeDir={bridgeDir()} />
      </section>
      <section className="stack">
        <h2>API keys</h2>
        {active.length ? (
          <div className="scroll">
            <table>
              <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th /></tr></thead>
              <tbody>
                {active.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td><code>{k.prefix}…</code></td>
                    <td className="small">{k.scopes.join(' · ')}</td>
                    <td className="small dim">{when(k.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="small dim">{k.lastUsedAt ? when(k.lastUsedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <form action={revokeApiKey}><input type="hidden" name="keyId" value={k.id} /><button type="submit" className="link-button">Revoke</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="small muted">No keys yet. Create one above to connect a client.</p>}
        {revoked.length ? <p className="small dim">{revoked.length} revoked key{revoked.length === 1 ? '' : 's'} hidden.</p> : null}
      </section>
      <section className="stack">
        <h2>What agents can do</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Tool</th><th>Scope</th><th>What it does</th></tr></thead>
            <tbody>
              {mcp.tools.map((t) => (
                <tr key={t.name}><td><code>{t.name}</code></td><td><span className={`tag${t.scope === 'write' ? ' signal' : ''}`}>{t.scope}</span></td><td className="small muted">{t.description}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {mcp.resources.length ? <p className="small dim">Resources: {mcp.resources.map((r) => <code key={r.uri} style={{ marginRight: 8 }}>{r.uri}</code>)}</p> : null}
      </section>
      <section className="stack">
        <h2>Redirect URLs to register</h2>
        <p className="muted small">Each platform's developer app needs its URL registered exactly. Built from <code>HARBOR_API_URL</code> = <code>{API_PUBLIC_URL}</code>.</p>
        <div className="scroll">
          <table>
            <thead><tr><th>Platform</th><th>Redirect URL</th><th>Metrics</th></tr></thead>
            <tbody>
              {platforms.map((p) => (
                <tr key={p.platform}>
                  <td>{PLATFORM_NAME[p.platform]}</td>
                  <td><code>{`${API_PUBLIC_URL}/v1/channels/${p.platform}/callback`}</code></td>
                  <td>{p.reportsMetrics ? 'Yes' : <span className="muted">Not available</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {API_PUBLIC_URL.startsWith('http://') ? (
          <p className="notice small">Instagram and Threads only accept HTTPS redirect URLs. Run a stable tunnel and set <code>HARBOR_API_URL</code> to it (see the setup guide).</p>
        ) : null}
      </section>
      <section className="stack">
        <h2>Install</h2>
        <ul className="list small">
          <li><strong>API (server side)</strong><code>{API_INTERNAL_URL}</code></li>
          <li><strong>API (browser and OAuth)</strong><code>{API_PUBLIC_URL}</code></li>
          <li><strong>Setup guide</strong><code>docs/setup/platform-apps.md</code></li>
        </ul>
      </section>
    </>
  );
}

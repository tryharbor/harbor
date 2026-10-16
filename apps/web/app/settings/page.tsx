import { API_INTERNAL_URL, API_PUBLIC_URL, getPlatforms, loadAll, type PlatformInfo } from '../api';
import { LoadError, PageHeader, PLATFORM_NAME } from '../ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const res = await loadAll<[PlatformInfo[]]>([getPlatforms()]);
  if (!res.ok) return (<><PageHeader title="Settings" /><LoadError message={res.error} /></>);
  const [platforms] = res.data;
  return (
    <>
      <PageHeader title="Settings" sub="How this Harbor install connects to the platforms." />
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

import Link from 'next/link';
import { deleteProject, restoreVersion, runLive, saveStripeKey, setBuildCap, startBuild, stopBuild } from '../../../actions';
import { getMode, getProject, getProjectFile, getProjectFiles, getProjectHistory, getProjectSettings, loadAll, type AppSettings, type BuildRun, type Mode, type ProjectView } from '../../../api';
import { previewToken } from '../../../auth';
import { AutoRefresh } from '../../../components/auto-refresh';
import { SubmitButton } from '../../../components/submit-button';
import { LoadError, when } from '../../../ui';

export const dynamic = 'force-dynamic';

/**
 * A Full app project, laid out like Replit: a slim chat on the left (each build collapses to its summary), and the app
 * filling the rest of the screen with a thin toolbar for Preview, Files and History. Everything else stays out of the way.
 */

const money = (cents: number) => (cents > 0 && cents < 1 ? '<$0.01' : `$${(cents / 100).toFixed(2)}`);
const TOOL_WORD: Record<string, string> = { write_file: 'Wrote', read_file: 'Read', list_files: 'Looked at files', delete_file: 'Deleted', run: 'Ran', done: 'Done' };
const FAILED: Partial<Record<BuildRun['status'], string>> = { failed: 'Didn’t finish', budget: 'Paused at the cost cap', stopped: 'Stopped', steps: 'Paused at the step limit' };
/** Only a Vercel Sandbox address is ever framed as the live preview (it arrives in the URL, so check it). */
const liveUrl = (v?: string) => {
  try {
    const u = new URL(v ?? '');
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel.run') ? u.origin : undefined;
  } catch {
    return undefined;
  }
};
const IDEAS = ['A page where customers pick a product and a delivery day', 'A simple order form that emails me', 'A members-only page with a sign-up form'];

function Steps({ run }: { run: BuildRun }) {
  return (
    <ol className="ide-steps">
      {run.steps.map((x, i) =>
        x.kind === 'message' ? <li key={i}>{x.text}</li>
          : x.kind === 'action' ? <li key={i} className="dim">{TOOL_WORD[x.tool ?? ''] ?? x.tool} <code>{x.text}</code></li>
          : <li key={i} className={x.kind === 'error' ? 'err' : 'dim'}><pre>{x.text}</pre></li>,
      )}
    </ol>
  );
}

function Run({ run, projectId }: { run: BuildRun; projectId: string }) {
  const actions = run.steps.filter((x) => x.kind === 'action').length;
  const latest = [...run.steps].reverse().find((x) => x.kind === 'message')?.text;
  return (
    <li className="ide-run">
      <p className="ide-you">{run.request}</p>
      {run.status === 'running' ? (
        <div className="ide-agent">
          <p className="ide-working"><span className="ide-dot" aria-hidden="true" />{latest ?? 'Starting…'}</p>
          <details><summary>{actions} step{actions === 1 ? '' : 's'} so far</summary><Steps run={run} /></details>
          <form action={stopBuild}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="runId" value={run.id} />
            <SubmitButton className="mono-button" pending="Stopping…">Stop</SubmitButton>
          </form>
        </div>
      ) : (
        <div className="ide-agent">
          {FAILED[run.status] ? <span className="ide-flag">{FAILED[run.status]}</span> : null}
          {run.summary ? <p>{run.summary}</p> : null}
          <details>
            <summary>Worked through {actions} step{actions === 1 ? '' : 's'} · {money(run.costCents)}</summary>
            <Steps run={run} />
            <p className="dim small">{when(run.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {run.model}{run.commitSha ? ` · version ${run.commitSha.slice(0, 7)}` : ''}</p>
          </details>
        </div>
      )}
    </li>
  );
}

export default async function AppProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; file?: string; live?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const s = await searchParams;
  const tab = s.tab === 'files' || s.tab === 'history' ? s.tab : 'preview';
  const res = await loadAll<[ProjectView, Mode, AppSettings]>([getProject(id), getMode(), getProjectSettings(id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [{ project, runs, sandbox }, mode, settings] = res.data;
  const running = runs.some((r) => r.status === 'running');
  const extra = await loadAll<[{ path: string; bytes: number }[], { sha: string; message: string; at: string }[], { path: string; content: string } | undefined]>([
    tab === 'files' ? getProjectFiles(id) : Promise.resolve([]),
    tab === 'history' ? getProjectHistory(id) : Promise.resolve([]),
    tab === 'files' && s.file ? getProjectFile(id, s.file).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const [files, commits, file] = extra.ok ? extra.data : [[], [], undefined];
  const lastSha = [...runs].reverse().find((r) => r.commitSha)?.commitSha ?? '';
  const preview = `/p/${previewToken(project.id)}/index.html`;
  const tabHref = (t: string) => `/build/apps/${project.id}?tab=${t}`;
  const live = tab === 'preview' ? liveUrl(s.live) : undefined;
  const canLive = sandbox.kind === 'vercel' && sandbox.available;

  return (
    <div className="ide">
      <AutoRefresh active={running} />
      <aside className="ide-chat">
        <header className="ide-head">
          <Link href={`/build?brand=${project.brandId}`} className="ide-back" aria-label="Back to apps">←</Link>
          <strong className="ide-name">{project.name}</strong>
          <details className="ide-menu">
            <summary aria-label="App settings">⋯</summary>
            <div className="ide-pop">
              <p className="small dim">{money(project.spentCents)} spent · {mode.modelLabel}</p>
              <form action={setBuildCap} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="projectId" value={project.id} />
                <label htmlFor="cap" className="small" style={{ fontWeight: 400 }}>Cap per build $</label>
                <input id="cap" name="cap" type="number" min={0.5} max={100} step={0.5} defaultValue={(project.budgetCents / 100).toFixed(2)} style={{ width: 80 }} />
                <SubmitButton pending="…">Save</SubmitButton>
              </form>
              <div className="divider" />
              <strong className="small">Payments (Stripe)</strong>
              {settings.stripe ? (
                <form action={saveStripeKey} className="row" style={{ gap: 6, justifyContent: 'space-between' }}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="remove" value="1" />
                  <span className="small"><span className={`pill ${settings.stripe.mode === 'live' ? 's-published' : 'plain'}`}>{settings.stripe.mode === 'live' ? 'Live key' : 'Test key'}</span> ending {settings.stripe.last4}</span>
                  <button type="submit" className="link-button small">Remove</button>
                </form>
              ) : settings.canStore ? (
                <form action={saveStripeKey} className="stack" style={{ gap: 6 }}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input name="key" type="password" required autoComplete="off" placeholder="sk_test_…" aria-label="Stripe secret key" />
                  <span className="small dim">Your Stripe secret key, from Stripe → Developers → API keys. Start with a test key. Stored encrypted; only this app gets it.</span>
                  <SubmitButton pending="Saving…">Save key</SubmitButton>
                </form>
              ) : <span className="small dim">Harbor can’t store keys on this server yet (HARBOR_SECRET_KEY isn’t set).</span>}
              <div className="divider" />
              <form action={deleteProject}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="brandId" value={project.brandId} />
                <button type="submit" className="link-button small">Delete this app</button>
              </form>
            </div>
          </details>
        </header>

        <div className="ide-thread">
          {s.error ? <p className="ide-note err" role="alert">{s.error}</p> : s.notice ? <p className="ide-note" role="status">{s.notice}</p> : null}
          {runs.length ? (
            <ol className="ide-runs">{runs.map((r) => <Run key={r.id} run={r} projectId={project.id} />)}</ol>
          ) : (
            <div className="ide-empty">
              <strong>What should we build first?</strong>
              <span className="small muted">Harbor uses your business’s facts and colours. Start small; you can keep adding.</span>
              {IDEAS.map((t) => (
                <form key={t} action={startBuild}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="request" value={t} />
                  <SubmitButton className="ide-idea" pending="Starting…">{t}</SubmitButton>
                </form>
              ))}
            </div>
          )}
        </div>

        <form action={startBuild} className="ide-compose">
          <input type="hidden" name="projectId" value={project.id} />
          <textarea name="request" required maxLength={4000} disabled={running} rows={3} placeholder={running ? 'Building… ask for the next thing when it’s done.' : 'Ask Harbor to build or change something…'} aria-label="What should Harbor build?" />
          <div className="ide-compose-bar">
            <span className="small dim">{mode.model === 'simulated' ? 'Simulated · free' : `${mode.modelLabel} · up to ${money(project.budgetCents)}`}</span>
            <SubmitButton className="primary" pending="Starting…">Build</SubmitButton>
          </div>
        </form>
      </aside>

      <section className="ide-main">
        <div className="ide-bar">
          <nav className="segmented" aria-label="View">
            {(['preview', 'files', 'history'] as const).map((t) => (
              <Link key={t} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}>{t[0]!.toUpperCase() + t.slice(1)}</Link>
            ))}
          </nav>
          {tab === 'preview' ? (
            <>
              {live ? (
                <span className="ide-url" title="Your app, running in its sandbox">Live · {live.replace(/^https:\/\//, '')}</span>
              ) : (
                <span className="ide-url" title={canLive ? 'The files as a static site. Run live starts the app itself in its sandbox.' : 'No sandbox connected: the preview shows the files as a static site. Commands and a live dev server need a sandbox.'}>
                  Static preview · index.html
                </span>
              )}
              {canLive && !running ? (
                live ? <Link className="button mono-button" href={tabHref('preview')}>Static</Link> : (
                  <form action={runLive}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <SubmitButton className="mono-button" pending="Starting…">Run live</SubmitButton>
                  </form>
                )
              ) : null}
              <a className="button mono-button" href={live ?? preview} target="_blank" rel="noreferrer">Open ↗</a>
            </>
          ) : <span className="ide-url">{tab === 'files' ? `${files.length} files` : `${commits.length} versions`}</span>}
        </div>
        <div className="ide-body">
          {tab === 'preview' ? (
            // Isolation comes from the response's CSP sandbox header (a unique origin): the app can't reach Harbor.
            live ? <iframe key={live} src={live} title="Live app preview" /> : <iframe key={lastSha} src={`${preview}?v=${lastSha}`} title="App preview" />
          ) : null}
          {tab === 'files' ? (
            <div className="ide-files">
              <ul>
                {files.map((f) => (
                  <li key={f.path}><Link href={`${tabHref('files')}&file=${encodeURIComponent(f.path)}`} aria-current={s.file === f.path ? 'page' : undefined}>{f.path}</Link></li>
                ))}
              </ul>
              {file ? <pre><code>{file.content}</code></pre> : <p className="small muted" style={{ padding: 16 }}>Pick a file.</p>}
            </div>
          ) : null}
          {tab === 'history' ? (
            <ol className="ide-history">
              {commits.map((c, i) => (
                <li key={c.sha}>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="evidence-text">{c.message.replace(/^Build: /, '')}</span>
                    <span className="small dim">{when(c.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{i === 0 ? ' · current' : ''}</span>
                  </span>
                  {i > 0 ? (
                    <form action={restoreVersion}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="sha" value={c.sha} />
                      <SubmitButton className="mono-button" pending="…">Restore</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>
    </div>
  );
}

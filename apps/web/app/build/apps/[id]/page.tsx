import Link from 'next/link';
import { deleteProject, restoreVersion, setBuildCap, startBuild, stopBuild } from '../../../actions';
import { getMode, getProject, getProjectFile, getProjectFiles, getProjectHistory, loadAll, type BuildRun, type Mode, type ProjectView } from '../../../api';
import { AutoRefresh } from '../../../components/auto-refresh';
import { SubmitButton } from '../../../components/submit-button';
import { previewToken } from '../../../auth';
import { Flash, LoadError, PageHeader, when } from '../../../ui';

export const dynamic = 'force-dynamic';

const STATUS: Record<BuildRun['status'], { text: string; cls: string }> = {
  running: { text: 'Building…', cls: 's-publishing' },
  succeeded: { text: 'Done', cls: 's-published' },
  failed: { text: 'Failed', cls: 's-failed' },
  budget: { text: 'Paused at the cost cap', cls: 's-unknown' },
  stopped: { text: 'Stopped', cls: 'plain' },
  steps: { text: 'Paused: step limit', cls: 's-unknown' },
};
const money = (cents: number) => (cents < 1 && cents > 0 ? '<$0.01' : `$${(cents / 100).toFixed(2)}`);
const TOOL_WORD: Record<string, string> = { write_file: 'Wrote', read_file: 'Read', list_files: 'Looked at the files', delete_file: 'Deleted', run: 'Ran', done: 'Done' };

function Run({ run, projectId }: { run: BuildRun; projectId: string }) {
  const s = STATUS[run.status];
  const actions = run.steps.filter((x) => x.kind === 'action');
  return (
    <li className="build-run">
      <p className="chat-bubble">{run.request}</p>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className={`pill ${s.cls}`}>{s.text}</span>
          <span className="small dim">{when(run.createdAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {run.model ?? 'model'} · {money(run.costCents)}</span>
        </div>
        <ol className="build-steps">
          {run.steps.map((x, i) =>
            x.kind === 'message' ? <li key={i} className="step-msg">{x.text}</li>
              : x.kind === 'action' ? <li key={i} className="step-act"><span className="dim">{TOOL_WORD[x.tool ?? ''] ?? x.tool}</span> <code>{x.text}</code></li>
              : <li key={i} className={`step-res${x.kind === 'error' ? ' err' : ''}`}><pre>{x.text}</pre></li>,
          )}
        </ol>
        {run.summary && run.status !== 'running' ? <p className="chat-reply">{run.summary}</p> : null}
        {run.status === 'running' ? (
          <form action={stopBuild}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="runId" value={run.id} />
            <SubmitButton pending="Stopping…">Stop</SubmitButton>
          </form>
        ) : actions.length ? <span className="small dim">{actions.length} step{actions.length === 1 ? '' : 's'}{run.commitSha ? ` · saved as version ${run.commitSha.slice(0, 7)}` : ''}</span> : null}
      </div>
    </li>
  );
}

export default async function AppProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; file?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const s = await searchParams;
  const tab = s.tab === 'files' || s.tab === 'history' ? s.tab : 'preview';
  const res = await loadAll<[ProjectView, Mode]>([getProject(id), getMode()]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [{ project, runs, sandbox }, mode] = res.data;
  const running = runs.some((r) => r.status === 'running');
  const extra = await loadAll<[{ path: string; bytes: number }[], { sha: string; message: string; at: string }[], { path: string; content: string } | undefined]>([
    tab === 'files' ? getProjectFiles(id) : Promise.resolve([]),
    tab === 'history' ? getProjectHistory(id) : Promise.resolve([]),
    tab === 'files' && s.file ? getProjectFile(id, s.file).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const [files, commits, file] = extra.ok ? extra.data : [[], [], undefined];
  const lastSha = [...runs].reverse().find((r) => r.commitSha)?.commitSha ?? '';

  return (
    <>
      <AutoRefresh active={running} />
      <PageHeader
        eyebrow={<Link href={`/build?brand=${project.brandId}&mode=app`}>← Build · Apps</Link>}
        title={project.name}
        sub={`${money(project.spentCents)} spent so far · builds stop at ${money(project.budgetCents)} each · ${mode.modelLabel}${mode.model === 'simulated' ? ' (no cost)' : ''}`}
      />
      <Flash params={s} />
      {!sandbox.available ? (
        <p className="notice small">This machine has no sandbox, so the builder writes files but can’t run commands (installs, tests, a dev server). The preview shows the files as a static site. Installing Docker turns commands and live previews on.</p>
      ) : null}

      <div className="app-work">
        <div className="stack">
          {runs.length ? <ol className="chat-thread build-thread">{runs.map((r) => <Run key={r.id} run={r} projectId={project.id} />)}</ol> : <p className="muted small">Tell Harbor what to build first: a page, a form, a feature. It uses your business’s facts and colours.</p>}
          <form action={startBuild} className="composer card">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="composer-form">
              <textarea name="request" required maxLength={4000} disabled={running} placeholder={running ? 'Building… you can ask for the next thing when it’s done.' : 'e.g. A page where customers pick a roast, a grind and a delivery day'} aria-label="What should Harbor build?" />
              <SubmitButton className="primary" pending="Starting…">Build</SubmitButton>
            </div>
          </form>
          <details className="small">
            <summary className="muted">Settings</summary>
            <form action={setBuildCap} className="row" style={{ gap: 6, marginTop: 8 }}>
              <input type="hidden" name="projectId" value={project.id} />
              <label htmlFor="cap" style={{ fontWeight: 400 }}>Cost cap per build ($)</label>
              <input id="cap" name="cap" type="number" min={0.5} max={100} step={0.5} defaultValue={(project.budgetCents / 100).toFixed(2)} style={{ width: 100 }} />
              <SubmitButton pending="Saving…">Save</SubmitButton>
            </form>
            <form action={deleteProject} style={{ marginTop: 8 }}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="brandId" value={project.brandId} />
              <button type="submit" className="link-button small">Delete this app and its files</button>
            </form>
          </details>
        </div>

        <div className="stack app-side">
          <nav className="segmented" aria-label="Project">
            {(['preview', 'files', 'history'] as const).map((t) => (
              <Link key={t} href={`/build/apps/${project.id}?tab=${t}`} aria-current={tab === t ? 'page' : undefined}>{t[0]!.toUpperCase() + t.slice(1)}</Link>
            ))}
          </nav>
          {tab === 'preview' ? (
            <div className="site-preview">
              {/* Isolation comes from the response's CSP sandbox header (set by the API and again by the preview route): the
                  app runs in a unique origin and can't reach Harbor's cookies or pages. An iframe sandbox attribute would add
                  nothing, and some embedded browsers refuse to load sandboxed frames at all. */}
              <iframe key={lastSha} src={`/p/${previewToken(project.id)}/index.html?v=${lastSha}`} title="App preview" />
            </div>
          ) : null}
          {tab === 'files' ? (
            <div className="file-view">
              <ul className="file-list">
                {files.map((f) => (
                  <li key={f.path}><Link href={`/build/apps/${project.id}?tab=files&file=${encodeURIComponent(f.path)}`} aria-current={s.file === f.path ? 'page' : undefined}>{f.path}</Link><span className="dim small">{f.bytes < 1024 ? `${f.bytes} B` : `${Math.round(f.bytes / 1024)} KB`}</span></li>
                ))}
              </ul>
              {file ? <pre className="file-code"><code>{file.content}</code></pre> : <p className="small muted">Pick a file to read it.</p>}
            </div>
          ) : null}
          {tab === 'history' ? (
            <ol className="list">
              {commits.map((c, i) => (
                <li key={c.sha} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
                  <span className="stack" style={{ gap: 0 }}><span>{c.message}</span><span className="small dim">{c.sha.slice(0, 7)} · {when(c.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{i === 0 ? ' · current' : ''}</span></span>
                  {i > 0 ? (
                    <form action={restoreVersion}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="sha" value={c.sha} />
                      <SubmitButton pending="Restoring…">Restore</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </>
  );
}

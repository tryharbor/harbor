import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HarborError, newId, type Brand } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import { runAgent, runSimulatedBuilder, type BuildOutcome, type BuildStep } from '../build/agent.ts';
import { writeStarter } from '../build/starter.ts';
import { Workspace, type Commit } from '../build/workspace.ts';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import { loadBrand } from './brands.ts';

/** Full app projects: create from the starter, build by request (in the background), history and restore, preview. */

export type BuildDeps = Pick<AppDeps, 'db' | 'models' | 'sandboxes' | 'projectsDir'>;

export interface Project { id: string; brandId: string; name: string; budgetCents: number; spentCents: number; createdAt: string; updatedAt: string }
export interface BuildRun {
  id: string; projectId: string; request: string; status: 'running' | BuildOutcome['status']; steps: BuildStep[]; summary?: string;
  model?: string; inputTokens: number; outputTokens: number; costCents: number; commitSha?: string; createdAt: string; finishedAt?: string;
}

interface ProjectRow { id: string; brand_id: string; name: string; budget_cents: number; spent_cents: string | number; created_at: Date | string; updated_at: Date | string }
interface RunRow {
  id: string; project_id: string; request: string; status: BuildRun['status']; steps: BuildStep[]; summary: string | null; model: string | null;
  input_tokens: number; output_tokens: number; cost_cents: string | number; commit_sha: string | null; created_at: Date | string; finished_at: Date | string | null;
}

const toProject = (r: ProjectRow): Project => ({ id: r.id, brandId: r.brand_id, name: r.name, budgetCents: Number(r.budget_cents), spentCents: Math.round(Number(r.spent_cents) * 100) / 100, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const toRun = (r: RunRow): BuildRun => ({
  id: r.id, projectId: r.project_id, request: r.request, status: r.status, steps: Array.isArray(r.steps) ? r.steps : [],
  ...(r.summary ? { summary: r.summary } : {}), ...(r.model ? { model: r.model } : {}),
  inputTokens: Number(r.input_tokens), outputTokens: Number(r.output_tokens), costCents: Math.round(Number(r.cost_cents) * 100) / 100,
  ...(r.commit_sha ? { commitSha: r.commit_sha } : {}), createdAt: iso(r.created_at), ...(r.finished_at ? { finishedAt: iso(r.finished_at) } : {}),
});

export async function loadProject(db: Db, id: string): Promise<Project> {
  const [r] = await db.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
  if (!r) throw new HarborError('NOT_FOUND', `Project ${id} not found.`);
  return toProject(r);
}

export async function listProjects(db: Db, brandId: string): Promise<Project[]> {
  return (await db.query<ProjectRow>('SELECT * FROM projects WHERE brand_id = $1 ORDER BY created_at DESC', [brandId])).map(toProject);
}

export const workspaceFor = (deps: Pick<BuildDeps, 'projectsDir'>, projectId: string) => Workspace.open(deps.projectsDir, projectId);

/** A new project with the starter files, as the first version in its history. */
export async function createProject(deps: BuildDeps, brand: Brand, input: { name: string }): Promise<Project> {
  const id = newId('project');
  const ws = await workspaceFor(deps, id);
  await ws.initGit();
  await writeStarter(ws, brand, input.name);
  await ws.commit('Start from the Harbor starter');
  await deps.db.query('INSERT INTO projects (id, workspace_id, brand_id, name) VALUES ($1, $2, $3, $4)', [id, brand.workspaceId, brand.id, input.name]);
  return loadProject(deps.db, id);
}

export async function updateProject(db: Db, id: string, patch: { name?: string; budgetCents?: number }): Promise<Project> {
  await db.query('UPDATE projects SET name = COALESCE($2, name), budget_cents = COALESCE($3, budget_cents), updated_at = now() WHERE id = $1', [id, patch.name ?? null, patch.budgetCents ?? null]);
  return loadProject(db, id);
}

export async function deleteProject(deps: BuildDeps, id: string): Promise<void> {
  const p = await loadProject(deps.db, id);
  if (await runningRun(deps.db, p.id)) throw new HarborError('CONFLICT', 'Stop the build first.');
  await deps.sandboxes.release?.(p.id).catch(() => undefined);
  await deps.db.query('DELETE FROM projects WHERE id = $1', [p.id]);
  await rm(join(deps.projectsDir, p.id), { recursive: true, force: true });
}

export async function listRuns(db: Db, projectId: string): Promise<BuildRun[]> {
  return (await db.query<RunRow>('SELECT * FROM build_runs WHERE project_id = $1 ORDER BY created_at ASC LIMIT 100', [projectId])).map(toRun);
}

export async function loadRun(db: Db, id: string): Promise<BuildRun> {
  const [r] = await db.query<RunRow>('SELECT * FROM build_runs WHERE id = $1', [id]);
  if (!r) throw new HarborError('NOT_FOUND', `Build ${id} not found.`);
  return toRun(r);
}

const runningRun = async (db: Db, projectId: string) => (await db.query<{ id: string }>("SELECT id FROM build_runs WHERE project_id = $1 AND status = 'running'", [projectId]))[0]?.id;

const STOPS = new Set<string>();
export async function stopBuild(db: Db, runId: string): Promise<BuildRun> {
  const run = await loadRun(db, runId);
  if (run.status === 'running') STOPS.add(runId);
  return run;
}

/** Builds whose process died with the server are marked failed at start-up, so a project is never stuck "running". */
export async function failInterruptedBuilds(db: Db): Promise<void> {
  await db.query(
    `UPDATE build_runs SET status = 'failed', summary = 'Harbor restarted while this build was running. Ask again to continue.', finished_at = now()
     WHERE status = 'running'`,
  );
}

/**
 * Start a build for `request` and return at once; the agent works in the background and records each step. One
 * build per project at a time. The cost cap per build is the project's budget.
 */
export async function startBuild(deps: BuildDeps, project: Project, request: string): Promise<{ run: BuildRun; done: Promise<void> }> {
  if (await runningRun(deps.db, project.id)) throw new HarborError('CONFLICT', 'A build is already running for this project.');
  const id = newId('buildRun');
  const llm = deps.models?.llm;
  await deps.db.query("INSERT INTO build_runs (id, project_id, request, status, model) VALUES ($1, $2, $3, 'running', $4)", [id, project.id, request, llm?.model ?? 'simulated-v1']);
  const run = await loadRun(deps.db, id);
  const done = runBuild(deps, project, run).catch(async (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    await deps.db.query("UPDATE build_runs SET status = 'failed', summary = $2, finished_at = now() WHERE id = $1 AND status = 'running'", [id, msg.slice(0, 1000)]);
  });
  return { run, done };
}

async function runBuild(deps: BuildDeps, project: Project, run: BuildRun): Promise<void> {
  const { db } = deps;
  const brand = await loadBrand(db, project.brandId);
  const ws = await workspaceFor(deps, project.id);
  const earlier = (await listRuns(db, project.id)).filter((r) => r.id !== run.id && r.summary).map((r) => ({ request: r.request, summary: r.summary! }));
  const canRun = await deps.sandboxes.available().catch(() => false);
  const ctx = {
    brand, projectName: project.name, request: run.request, earlier, workspace: ws, canRun,
    sandbox: () => deps.sandboxes.forProject(project.id, ws.root),
    budgetCents: project.budgetCents,
    onStep: async (s: BuildStep) => {
      await db.query('UPDATE build_runs SET steps = steps || $2::jsonb WHERE id = $1', [run.id, JSON.stringify([s])]);
    },
    stopped: () => STOPS.has(run.id),
  };
  const llm = deps.models?.llm;
  let outcome: BuildOutcome;
  try {
    outcome = llm ? await runAgent(llm.provider, llm.model, ctx) : await runSimulatedBuilder(ctx);
  } finally {
    STOPS.delete(run.id);
  }
  const sha = await ws.commit(`Build: ${run.request}`);
  await db.query(
    `UPDATE build_runs SET status = $2, summary = $3, model = $4, input_tokens = $5, output_tokens = $6, cost_cents = $7, commit_sha = $8, finished_at = now() WHERE id = $1`,
    [run.id, outcome.status, outcome.summary.slice(0, 2000), outcome.model, outcome.inputTokens, outcome.outputTokens, outcome.costCents, sha ?? null],
  );
  await db.query('UPDATE projects SET spent_cents = spent_cents + $2, updated_at = now() WHERE id = $1', [project.id, outcome.costCents]);
}

export async function history(deps: BuildDeps, projectId: string): Promise<Commit[]> {
  return (await workspaceFor(deps, projectId)).history();
}

export async function restore(deps: BuildDeps, project: Project, sha: string): Promise<{ sha?: string }> {
  if (await runningRun(deps.db, project.id)) throw new HarborError('CONFLICT', 'Stop the build before restoring.');
  const restored = await (await workspaceFor(deps, project.id)).restore(sha);
  return restored ? { sha: restored } : {};
}

/**
 * Start the project's app in its sandbox and return the address of the live preview, or null when there's nothing to
 * run (no dev server: the static preview shows the files).
 */
export async function livePreview(deps: BuildDeps, project: Project): Promise<{ url: string | null }> {
  if (deps.sandboxes.kind === 'none' || !(await deps.sandboxes.available().catch(() => false))) {
    throw new HarborError('CONFLICT', 'Live previews need a sandbox. Connect Vercel Sandbox to run apps.');
  }
  const ws = await workspaceFor(deps, project.id);
  const url = await (await deps.sandboxes.forProject(project.id, ws.root)).preview();
  return { url: url ?? null };
}


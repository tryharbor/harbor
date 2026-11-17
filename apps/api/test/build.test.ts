import { chmod, lstat, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HarborError } from '@harbor/core';
import { ModelRouter, SimulatedModel, type LlmProvider, type LlmRequest } from '@harbor/ai';
import { createApp, createDeps, type App } from '../src/app.ts';
import { costCents, runAgent, type BuildStep } from '../src/build/agent.ts';
import { dockerRunArgs, dockerSandboxes, noSandbox, type DockerRunner } from '../src/build/sandbox.ts';
import { Workspace } from '../src/build/workspace.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';
import { brandSchema } from '@harbor/core';

const brand = brandSchema.parse({ id: 'brd_t', workspaceId: 'ws_default', name: 'Tidewater', slug: 'tidewater', memory: RICH_MEMORY, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const tmp = (p: string) => mkdtemp(join(tmpdir(), p));

describe('Workspace', () => {
  it('keeps every path inside the project and away from .git', async () => {
    const ws = await Workspace.open(await tmp('harbor-ws-'), 'prj_paths');
    await ws.write('src/app.js', 'ok');
    expect(await ws.read('./src/app.js')).toBe('ok');
    for (const bad of ['../escape.txt', '/etc/passwd', 'a/../../b', '.git/config', 'x/.git/hooks/pre-commit', 'nul\0l']) {
      await expect(ws.write(bad, 'x')).rejects.toBeInstanceOf(HarborError);
    }
  });

  it('refuses to follow a symlink out of the project', async () => {
    const outside = await tmp('harbor-outside-');
    const ws = await Workspace.open(await tmp('harbor-ws-'), 'prj_links');
    await symlink(outside, join(ws.root, 'link'));
    await expect(ws.write('link/pwned.txt', 'x')).rejects.toThrow(/outside the project/);
    await expect(lstat(join(outside, 'pwned.txt'))).rejects.toThrow();
    expect((await ws.list()).map((f) => f.path)).toEqual([]);
  });

  it('commits, lists history and restores, removing files added since', async () => {
    const ws = await Workspace.open(await tmp('harbor-ws-'), 'prj_git');
    await ws.initGit();
    await ws.write('index.html', 'v1');
    const first = await ws.commit('First');
    await ws.write('index.html', 'v2');
    await ws.write('extra.js', 'new');
    await ws.commit('Second');
    expect(await ws.commit('Nothing changed')).toBeUndefined();
    expect((await ws.history()).map((c) => c.message)).toEqual(['Second', 'First']);
    await ws.restore(first!);
    expect(await ws.read('index.html')).toBe('v1');
    expect((await ws.list()).map((f) => f.path)).toEqual(['index.html']);
    expect((await ws.history())[0]!.message).toBe(`Restore version ${first!.slice(0, 7)}`);
    await expect(ws.restore('deadbeef')).rejects.toThrow(/isn't in this project's history/);
  });

  it('never runs a git hook placed in the project', async () => {
    const ws = await Workspace.open(await tmp('harbor-ws-'), 'prj_hook');
    await ws.initGit();
    const marker = join(ws.root, '..', 'hook-ran');
    await mkdir(join(ws.root, '.git', 'hooks'), { recursive: true });
    await writeFile(join(ws.root, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\ntouch ${marker}\n`);
    await chmod(join(ws.root, '.git', 'hooks', 'pre-commit'), 0o755);
    await ws.write('a.txt', 'a');
    await ws.commit('With a hook present');
    await expect(lstat(marker)).rejects.toThrow();
  });
});

describe('sandboxes', () => {
  it('has none without Docker, and says why', async () => {
    expect(await noSandbox.available()).toBe(false);
    await expect(noSandbox.forProject('prj_x', '/tmp')).rejects.toThrow(/needs a sandbox/);
  });

  it('locks the Docker container down', () => {
    const args = dockerRunArgs('prj_abc', '/data/projects/prj_abc');
    for (const flag of ['--cap-drop', 'ALL', 'no-new-privileges', '--read-only', '--user', '1000:1000', '--pids-limit', '--memory']) expect(args).toContain(flag);
    expect(args).toContain('/data/projects/prj_abc:/workspace:rw');
    expect(args).toContain('127.0.0.1::3000');
    expect(args).not.toContain('--privileged');
    expect(args.filter((a) => a === '-v')).toHaveLength(1);
  });

  it('starts the container once, runs commands inside it and finds the preview port', async () => {
    const calls: string[][] = [];
    let running = false;
    const fake: DockerRunner = async (args) => {
      calls.push(args);
      if (args[0] === 'inspect') return { exitCode: running ? 0 : 1, stdout: running ? 'true' : '', stderr: '', timedOut: false };
      if (args[0] === 'run') running = true;
      if (args[0] === 'port') return { exitCode: 0, stdout: '127.0.0.1:49153\n', stderr: '', timedOut: false };
      return { exitCode: 0, stdout: 'hi', stderr: '', timedOut: false };
    };
    const sb = await dockerSandboxes(fake).forProject('prj_abc', '/ws');
    await dockerSandboxes(fake).forProject('prj_abc', '/ws');
    expect(calls.filter((c) => c[0] === 'run')).toHaveLength(1);
    expect((await sb.exec('npm test')).stdout).toBe('hi');
    expect(calls.at(-1)).toEqual(['exec', '-w', '/workspace', 'harbor-prj_abc', 'sh', '-lc', 'npm test']);
    expect(await sb.preview()).toBe('http://127.0.0.1:49153');
  });
});

/** A provider that answers with each canned step in turn. */
function scripted(steps: unknown[], usage = { inputTokens: 1000, outputTokens: 500 }): LlmProvider & { reqs: LlmRequest[] } {
  const reqs: LlmRequest[] = [];
  return { provider: 'anthropic', reqs, async complete(model, req) { reqs.push(req); const s = steps.shift() ?? { message: 'done', actions: [{ tool: 'done' }] }; return { text: typeof s === 'string' ? s : JSON.stringify(s), usage, model }; } };
}

describe('the agent loop', () => {
  const ctxFor = async (over: Partial<Parameters<typeof runAgent>[2]> = {}) => {
    const ws = await Workspace.open(await tmp('harbor-agent-'), 'prj_agent');
    const steps: BuildStep[] = [];
    return { ws, steps, ctx: { brand, projectName: 'Orders', request: 'Add an order form', earlier: [], workspace: ws, sandbox: () => noSandbox.forProject('p', ''), canRun: false, budgetCents: 500, onStep: async (s: BuildStep) => void steps.push(s), stopped: () => false, ...over } };
  };

  it('writes files, explains steps, and stops at done, with the cost at list price', async () => {
    const { ws, steps, ctx } = await ctxFor();
    const llm = scripted([
      { message: 'Adding the form.', actions: [{ tool: 'write_file', path: 'index.html', content: '<form></form>' }, { tool: 'run', command: 'npm test' }, { tool: 'write_file', path: '../evil', content: 'x' }] },
      { message: 'The order form is in.', actions: [{ tool: 'done' }] },
    ]);
    const out = await runAgent(llm, 'claude-opus-5-5', ctx);
    expect(out).toMatchObject({ status: 'succeeded', summary: 'The order form is in.', inputTokens: 2000, outputTokens: 1000 });
    expect(out.costCents).toBeCloseTo(costCents('claude-opus-5-5', 2000, 1000));
    expect(await ws.read('index.html')).toBe('<form></form>');
    expect(steps.map((s) => s.kind)).toEqual(['message', 'action', 'action', 'result', 'action', 'result', 'message']);
    expect(steps.find((s) => s.kind === 'result' && s.tool === 'run')!.text).toMatch(/no sandbox/);
    // The second request shows the model what happened, including the refused path.
    expect(llm.reqs[1]!.prompt).toMatch(/isn't a file inside the project/);
    expect(llm.reqs[0]!.system).toContain('cannot run commands');
  });

  it('pauses at the cost cap', async () => {
    const { ctx } = await ctxFor({ budgetCents: 1 });
    const out = await runAgent(scripted([{ message: 'Working.', actions: [{ tool: 'list_files' }] }], { inputTokens: 100_000, outputTokens: 50_000 }), 'claude-opus-5-5', ctx);
    expect(out.status).toBe('budget');
    expect(out.costCents).toBeGreaterThan(1);
  });

  it('asks again after an answer that is not JSON, and honours Stop', async () => {
    const { steps, ctx } = await ctxFor();
    await runAgent(scripted(['nope', { message: 'ok', actions: [{ tool: 'done' }] }]), 'm', ctx);
    expect(steps[0]).toMatchObject({ kind: 'error' });
    let stop = false;
    const { ctx: c2 } = await ctxFor({ stopped: () => stop });
    const llm = scripted([{ message: 'Step', actions: [{ tool: 'list_files' }] }]);
    const orig = llm.complete.bind(llm);
    llm.complete = async (m, r) => { stop = true; return orig(m, r); };
    expect((await runAgent(llm, 'm', c2)).status).toBe('stopped');
  });
});

describe('/v1/projects', () => {
  let db: Db;
  let app: App;
  let brandId: string;
  let projectsDir: string;
  const send = sender(() => app);
  const waitForRun = async (projectId: string) => {
    for (let i = 0; i < 100; i++) {
      const p = await (await send('GET', `/v1/projects/${projectId}`)).json();
      const last = p.runs.at(-1);
      if (last && last.status !== 'running') return p;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('build never finished');
  };

  beforeAll(async () => {
    db = await openDb('memory://');
    projectsDir = await tmp('harbor-projects-');
    app = createApp(db, {}, createDeps(db, { publishMode: 'sandbox', modelMode: 'simulated', sandboxes: noSandbox, projectsDir }));
    brandId = (await (await send('POST', '/v1/brands', { name: 'Tidewater', memory: RICH_MEMORY })).json()).id;
  });
  afterAll(() => db.close());

  it('creates a project from the starter, builds by request, and restores', async () => {
    const res = await send('POST', `/v1/brands/${brandId}/projects`, { name: 'Order tracker' });
    expect(res.status).toBe(201);
    const project = await res.json();
    expect(project).toMatchObject({ id: expect.stringMatching(/^prj_/), name: 'Order tracker', budgetCents: 500, spentCents: 0 });
    const files = (await (await send('GET', `/v1/projects/${project.id}/files`)).json()).data.map((f: { path: string }) => f.path);
    expect(files).toEqual(['.gitignore', 'config.js', 'content/home.html', 'lib/auth.js', 'lib/db.js', 'lib/pages.js', 'lib/payments.js', 'package.json', 'public/styles.css', 'README.md', 'server.js']);
    const [start] = (await (await send('GET', `/v1/projects/${project.id}/history`)).json()).data;
    expect(start.message).toBe('Start from the Harbor starter');

    const build = await send('POST', `/v1/projects/${project.id}/builds`, { request: 'A page to track coffee orders' });
    expect(build.status).toBe(202);
    const done = await waitForRun(project.id);
    expect(done.sandbox).toEqual({ kind: 'none', available: false });
    const run = done.runs.at(-1);
    expect(run).toMatchObject({ status: 'succeeded', model: 'simulated-v1', costCents: 0, commitSha: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(run.steps.map((s: BuildStep) => s.kind)).toContain('action');

    // A server app has no index.html: the static preview says to run it live.
    const preview = await send('GET', `/v1/projects/${project.id}/preview/index.html`);
    expect(preview.headers.get('content-security-policy')).toBe('sandbox allow-scripts allow-forms allow-modals');
    expect(preview.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await preview.text()).toContain('Run live');
    const home = async () => (await send('GET', `/v1/projects/${project.id}/preview/content/home.html`)).text();
    expect(await home()).toContain('A page to track coffee orders');
    expect((await send('GET', `/v1/projects/${project.id}/preview/public/styles.css`)).headers.get('content-type')).toBe('text/css; charset=utf-8');
    expect((await send('GET', `/v1/projects/${project.id}/preview/..%2F..%2Fsecrets`)).status).toBe(400);

    expect((await send('POST', `/v1/projects/${project.id}/restore`, { sha: start.sha })).status).toBe(200);
    expect(await home()).not.toContain('track coffee orders');
  });

  it('runs one build at a time, and deletes the project with its files', async () => {
    const project = await (await send('POST', `/v1/brands/${brandId}/projects`, { name: 'Busy' })).json();
    await send('POST', `/v1/projects/${project.id}/builds`, { request: 'one' });
    const second = await send('POST', `/v1/projects/${project.id}/builds`, { request: 'two' });
    expect([202, 409]).toContain(second.status); // the simulated build may already have finished
    await waitForRun(project.id);
    expect((await send('DELETE', `/v1/projects/${project.id}`)).status).toBe(204);
    await expect(lstat(join(projectsDir, project.id))).rejects.toThrow();
  });

  it('builds with the active real model through the agent loop', async () => {
    const llm = scripted([{ message: 'Adding a list.', actions: [{ tool: 'write_file', path: 'orders.html', content: '<ul></ul>' }] }, { message: 'Done: a list page.', actions: [{ tool: 'done' }] }]);
    const db2 = await openDb('memory://');
    const deps = createDeps(db2, { publishMode: 'sandbox', sandboxes: noSandbox, projectsDir: await tmp('harbor-projects-'), model: new ModelRouter(new SimulatedModel(), { provider: 'anthropic', apiKey: 'k' }, () => llm) });
    const app2 = createApp(db2, {}, deps);
    const s2 = sender(() => app2);
    const b = (await (await s2('POST', '/v1/brands', { name: 'Live Co', memory: RICH_MEMORY })).json()).id;
    const p = await (await s2('POST', `/v1/brands/${b}/projects`, { name: 'Orders' })).json();
    await s2('POST', `/v1/projects/${p.id}/builds`, { request: 'An order list' });
    let run;
    for (let i = 0; i < 100 && (!run || run.status === 'running'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      run = (await (await s2('GET', `/v1/projects/${p.id}`)).json()).runs.at(-1);
    }
    expect(run).toMatchObject({ status: 'succeeded', model: 'claude-opus-5-5', summary: 'Done: a list page.', inputTokens: 2000, outputTokens: 1000 });
    expect((await (await s2('GET', `/v1/projects/${p.id}`)).json()).project.spentCents).toBeGreaterThan(0);
    await db2.close();
  });
});

import { createHash } from 'node:crypto';
import { HarborError } from '@harbor/core';
import type { ExecResult, Sandbox, SandboxProvider } from './sandbox.ts';
import { PREVIEW_PORT } from './sandbox.ts';
import { MAX_FILE_BYTES, Workspace } from './workspace.ts';

/**
 * Full app sandboxes on Vercel Sandbox (decision 0004): one Firecracker microVM per project, named after it, persistent
 * (files survive stops), with the dev server's port exposed at a public `*.vercel.run` address for the live preview.
 *
 * The sandbox is remote, so it can't mount the project folder. Harbor's copy stays the source of truth:
 * - before every command, files that changed in Harbor are pushed to the sandbox (and files deleted in Harbor are deleted);
 * - after it, files the command created or changed come back through the Workspace, so the same path checks apply
 *   (nothing outside the project, no `.git`, no symlinks); dependencies and build output never come back.
 *
 * Network: deny by default, package registries allowed. No Harbor secret is ever passed into the sandbox.
 */

/** What Harbor needs from a remote sandbox. The real one wraps @vercel/sandbox; tests use a fake. */
export interface RemoteBox {
  run(command: string, opts: { cwd: string; timeoutMs: number; env?: Record<string, string> }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** Start a long-running command and return without waiting (the dev server). */
  start(command: string, opts: { cwd: string; env?: Record<string, string> }): Promise<void>;
  writeFiles(files: { path: string; content: Buffer }[]): Promise<void>;
  readFile(path: string): Promise<Buffer | null>;
  domain(port: number): string;
  stop(): Promise<void>;
}

export interface RemoteBoxes {
  /** The project's sandbox, created on first use, resumed after a stop. */
  connect(name: string): Promise<RemoteBox>;
  /** Delete the project's sandbox for good (no-op if there isn't one). */
  destroy(name: string): Promise<void>;
}

export const REMOTE_ROOT = '/vercel/sandbox/app';
/** Dependencies and build output: never synced either way. */
const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', '.cache', '.vercel', 'build', '.turbo'];
const MAX_PULL = 300;
/** Package registries: what a starter needs to install dependencies. Everything else is blocked. */
export const ALLOWED_HOSTS = ['registry.npmjs.org', '*.npmjs.org', 'registry.yarnpkg.com', 'pypi.org', 'files.pythonhosted.org'];

export const boxName = (projectId: string) => `harbor-${projectId.replace(/[^a-z0-9]/g, '-')}`;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const OUTPUT_LIMIT = 20_000;
const cap = (s: string) => (s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT / 2)}\n… (output cut) …\n${s.slice(-OUTPUT_LIMIT / 2)}` : s);
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** `sha256sum` of every synced file under the project, one "hash  ./path" line each. */
export const LIST_COMMAND = `find . \\( ${SKIP_DIRS.map((d) => `-name ${d}`).join(' -o ')} \\) -prune -o -type f -print0 | xargs -0 -r sha256sum`;

export function parseListing(out: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of out.split('\n')) {
    // A leading backslash means sha256sum escaped an odd file name (newline or backslash): skip those files.
    const hit = /^([0-9a-f]{64}) [ *]\.\/(.+)$/.exec(line);
    if (hit) m.set(hit[2]!, hit[1]!);
  }
  return m;
}

async function localHashes(ws: Workspace): Promise<Map<string, { hash: string; bytes: Buffer }>> {
  const m = new Map<string, { hash: string; bytes: Buffer }>();
  for (const f of await ws.list()) {
    if (f.path.split('/').some((p) => SKIP_DIRS.includes(p))) continue;
    const bytes = await ws.readBytes(f.path);
    m.set(f.path, { hash: sha(bytes), bytes });
  }
  return m;
}

/** One project's sandbox: the remote box plus what Harbor last knew was in it. */
class VercelProjectSandbox implements Sandbox {
  /** Remote path → hash, as of the last sync; undefined until first listed. */
  private remote?: Map<string, string>;
  /** Files in the sandbox Harbor chose not to copy back (too big); never deleted from the sandbox on push. */
  private kept = new Set<string>();

  constructor(private readonly boxes: RemoteBoxes, private readonly name: string, private box: RemoteBox, private readonly ws: Workspace) {}

  private async list(): Promise<Map<string, string>> {
    const r = await this.box.run(LIST_COMMAND, { cwd: REMOTE_ROOT, timeoutMs: 60_000 });
    if (r.exitCode !== 0) throw new HarborError('UPSTREAM_ERROR', `Couldn't list the sandbox's files: ${r.stderr.slice(0, 200)}`);
    return parseListing(r.stdout);
  }

  /** Make the sandbox match Harbor's files. */
  async push(): Promise<void> {
    const local = await localHashes(this.ws);
    const remote = this.remote ?? (await this.list());
    const changed = [...local].filter(([p, f]) => remote.get(p) !== f.hash).map(([path, f]) => ({ path: `${REMOTE_ROOT}/${path}`, content: f.bytes }));
    const gone = [...remote.keys()].filter((p) => !local.has(p) && !this.kept.has(p));
    for (let i = 0; i < changed.length; i += 50) await this.box.writeFiles(changed.slice(i, i + 50));
    if (gone.length) await this.box.run(`rm -f -- ${gone.map((p) => q(p)).join(' ')}`, { cwd: REMOTE_ROOT, timeoutMs: 60_000 });
    this.remote = new Map([...local].map(([p, f]) => [p, f.hash]));
    for (const p of this.kept) if (remote.has(p)) this.remote.set(p, remote.get(p)!);
  }

  /** Bring back what a command changed. Returns notes for the agent about anything not copied. */
  async pull(): Promise<string[]> {
    const before = this.remote ?? new Map();
    const after = await this.list();
    const notes: string[] = [];
    const changed = [...after].filter(([p, h]) => before.get(p) !== h);
    if (changed.length > MAX_PULL) notes.push(`${changed.length - MAX_PULL} more changed files weren't copied back (limit ${MAX_PULL} per command).`);
    for (const [path] of changed.slice(0, MAX_PULL)) {
      const bytes = await this.box.readFile(`${REMOTE_ROOT}/${path}`);
      if (!bytes) continue;
      if (bytes.length > MAX_FILE_BYTES) {
        this.kept.add(path);
        notes.push(`${path} stays in the sandbox only (over 512 KB).`);
        continue;
      }
      try {
        await this.ws.write(path, bytes);
        this.kept.delete(path);
      } catch (err) {
        this.kept.add(path);
        notes.push(`${path} wasn't copied back: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    for (const p of before.keys()) {
      if (!after.has(p)) {
        this.kept.delete(p);
        await this.ws.remove(p).catch(() => undefined);
      }
    }
    this.remote = after;
    return notes;
  }

  async exec(command: string, opts?: { timeoutMs?: number }): Promise<ExecResult> {
    const timeoutMs = Math.min(opts?.timeoutMs ?? 120_000, 600_000);
    await this.push();
    const t0 = Date.now();
    const r = await this.box.run(command, { cwd: REMOTE_ROOT, timeoutMs, env: { PORT: String(PREVIEW_PORT), HOST: '0.0.0.0', NPM_CONFIG_UPDATE_NOTIFIER: 'false' } });
    const timedOut = r.exitCode !== 0 && Date.now() - t0 >= timeoutMs - 1000;
    const notes = await this.pull();
    return { exitCode: r.exitCode, stdout: cap(r.stdout), stderr: cap(r.stderr + (notes.length ? `\n[harbor] ${notes.join('\n[harbor] ')}` : '')), timedOut };
  }

  /**
   * Start the app's dev server (package.json "dev", else "start") on the preview port and return its public address.
   * Undefined when the project has no server to run (a static site: the static preview shows it).
   */
  async preview(): Promise<string | undefined> {
    let pkg: { scripts?: Record<string, string> } = {};
    try {
      pkg = JSON.parse(await this.ws.read('package.json'));
    } catch {
      return undefined;
    }
    const script = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : undefined;
    if (!script) return undefined;
    this.box = await this.boxes.connect(this.name); // resumes a stopped sandbox, with fresh routes
    await this.push();
    const env = { PORT: String(PREVIEW_PORT), HOST: '0.0.0.0', NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
    const isUp = async () => (await this.box.run(`curl -s -o /dev/null -m 2 http://127.0.0.1:${PREVIEW_PORT}/ && echo up`, { cwd: REMOTE_ROOT, timeoutMs: 10_000 })).stdout.includes('up');
    if (!(await isUp())) {
      const install = await this.box.run('test -d node_modules || npm install --no-audit --no-fund', { cwd: REMOTE_ROOT, timeoutMs: 300_000, env });
      if (install.exitCode !== 0) throw new HarborError('UPSTREAM_ERROR', `Installing the app's packages failed: ${install.stderr.slice(-300)}`);
      await this.box.start(`npm run ${script} > /tmp/harbor-dev.log 2>&1`, { cwd: REMOTE_ROOT, env });
      let up = false;
      for (let i = 0; i < 45 && !up; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        up = await isUp();
      }
      if (!up) {
        const log = await this.box.run('tail -n 30 /tmp/harbor-dev.log', { cwd: REMOTE_ROOT, timeoutMs: 10_000 });
        throw new HarborError('UPSTREAM_ERROR', `The app's dev server didn't start:\n${log.stdout.slice(-1500)}`);
      }
    }
    return this.box.domain(PREVIEW_PORT);
  }

  async stop(): Promise<void> {
    await this.box.stop();
  }
}

export function vercelSandboxes(boxes: RemoteBoxes): SandboxProvider {
  const open = new Map<string, Promise<VercelProjectSandbox>>();
  return {
    kind: 'vercel',
    available: async () => true,
    forProject(projectId, workspaceRoot) {
      let s = open.get(projectId);
      if (!s) {
        const name = boxName(projectId);
        s = boxes.connect(name).then(async (box) => {
          await box.run(`mkdir -p ${REMOTE_ROOT}`, { cwd: '/vercel/sandbox', timeoutMs: 30_000 });
          return new VercelProjectSandbox(boxes, name, box, new Workspace(workspaceRoot));
        });
        s.catch(() => open.delete(projectId));
        open.set(projectId, s);
      }
      return s;
    },
    async release(projectId) {
      open.delete(projectId);
      await boxes.destroy(boxName(projectId));
    },
  };
}

// ---- The real thing: @vercel/sandbox ----

export interface VercelCredentials { token: string; teamId: string; projectId: string }

/**
 * Credentials from the environment: VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID (an access token), or
 * VERCEL_OIDC_TOKEN (from `vercel env pull`). Undefined when neither is set: Harbor then never calls Vercel, so the SDK's
 * interactive sign-in can't start.
 */
export function vercelCredentialsFromEnv(env: Record<string, string | undefined> = process.env): VercelCredentials | 'oidc' | undefined {
  const token = env.VERCEL_TOKEN?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  // The team and project alone (no token yet) just means "not connected"; a token without them is a mistake.
  if (token) throw new Error('Vercel Sandbox needs VERCEL_TEAM_ID and VERCEL_PROJECT_ID along with VERCEL_TOKEN.');
  return env.VERCEL_OIDC_TOKEN?.trim() ? 'oidc' : undefined;
}

export function realVercelBoxes(creds: VercelCredentials | 'oidc'): RemoteBoxes {
  const auth = creds === 'oidc' ? {} : creds;
  const load = () => import('@vercel/sandbox');
  const wrap = (sb: import('@vercel/sandbox').Sandbox): RemoteBox => ({
    async run(command, opts) {
      // The sandbox kills the command (SIGKILL) at timeoutMs, so nothing keeps running after Harbor stops waiting.
      const r = await sb.runCommand({ cmd: 'sh', args: ['-lc', command], cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}), timeoutMs: opts.timeoutMs });
      const [stdout, stderr] = await Promise.all([r.stdout().catch(() => ''), r.stderr().catch(() => '')]);
      return { exitCode: r.exitCode, stdout, stderr };
    },
    async start(command, opts) {
      await sb.runCommand({ cmd: 'sh', args: ['-lc', command], cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}), detached: true });
    },
    writeFiles: (files) => sb.writeFiles(files),
    readFile: (path) => sb.readFileToBuffer({ path }),
    domain: (port) => sb.domain(port),
    async stop() {
      await sb.stop();
    },
  });
  return {
    async connect(name) {
      const { Sandbox } = await load();
      const sb = await Sandbox.getOrCreate({
        ...auth,
        name,
        ports: [PREVIEW_PORT],
        timeout: 30 * 60_000,
        resources: { vcpus: 2 },
        persistent: true,
        networkPolicy: { allow: ALLOWED_HOSTS },
        tags: { app: 'harbor' },
      });
      return wrap(sb);
    },
    async destroy(name) {
      const { Sandbox } = await load();
      const sb = await Sandbox.get({ ...auth, name }).catch(() => undefined);
      await sb?.delete();
    },
  };
}

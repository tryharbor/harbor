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
 *   (nothing outside the project, no `.git`, no symlinks); dependencies and build output never come back;
 * - what the running app saves (anything under data/, and any file that changed between syncs without Harbor writing
 *   it) stays in the sandbox: customers' data never lands in the project's files or its version history.
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

/** The sandbox's home is /vercel (user ubuntu); the project lives in a folder of its own under it. */
export const REMOTE_ROOT = '/vercel/app';
/** Dependencies and build output: never synced either way. */
const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', '.cache', '.vercel', 'build', '.turbo'];
const MAX_PULL = 300;
/** Package registries, plus Stripe's API for the starter's payments. Everything else is blocked. */
export const ALLOWED_HOSTS = ['registry.npmjs.org', '*.npmjs.org', 'registry.yarnpkg.com', 'pypi.org', 'files.pythonhosted.org', 'api.stripe.com'];

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

/**
 * Where an app keeps what it saves while running (orders, sign-ups). Harbor never copies it back: it's the business's
 * customers' data, not code, so it stays in the sandbox and out of the project's version history.
 */
export const DATA_DIR = 'data';
const isData = (p: string) => p === DATA_DIR || p.startsWith(`${DATA_DIR}/`);

/**
 * The dev server runs in a process group of its own (setsid), whose id is kept in /tmp/harbor-dev.pgid, so stopping it
 * stops npm and the app together. Anything still listening on the preview port goes too (servers started before).
 */
export const startServer = (script: string) => `echo $$ > /tmp/harbor-dev.pgid; exec setsid npm run ${script} > /tmp/harbor-dev.log 2>&1`;
export const INSTALL_IF_NEEDED = `test -d node_modules || node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));process.exit(Object.keys({...p.dependencies,...p.devDependencies}).length?1:0)" || npm install --no-audit --no-fund`;
export const stopServer = () => `test -f /tmp/harbor-dev.pgid && kill -TERM -- -$(cat /tmp/harbor-dev.pgid) 2>/dev/null; rm -f /tmp/harbor-dev.pgid; pkill -f 'npm run (dev|start)' 2>/dev/null; lsof -t -iTCP:${PREVIEW_PORT} -sTCP:LISTEN | xargs -r kill 2>/dev/null; sleep 1; true`;

/** One project's sandbox: the remote box plus what Harbor last knew was in it. */
class VercelProjectSandbox implements Sandbox {
  /** Remote path → hash, as Harbor left it after the last sync; undefined until first listed. */
  private remote?: Map<string, string>;
  /**
   * Files that live only in the sandbox: what the running app wrote (changed between syncs, not by Harbor), files that
   * were there when Harbor (re)connected, and files too big to copy. Never copied back, never deleted on push.
   */
  private sandboxOnly = new Set<string>();

  /** The app's secrets (its Stripe key): never shown to the agent. */
  private hidden: string[] = [];

  constructor(private readonly boxes: RemoteBoxes, private readonly name: string, private box: RemoteBox, private readonly ws: Workspace) {}

  redact(values: string[]): void {
    this.hidden = values.filter((v) => v.length >= 8);
  }

  private scrub(text: string): string {
    let out = text;
    for (const v of this.hidden) out = out.split(v).join('[hidden]');
    return out;
  }

  private async list(): Promise<Map<string, string>> {
    const r = await this.box.run(LIST_COMMAND, { cwd: REMOTE_ROOT, timeoutMs: 60_000 });
    if (r.exitCode !== 0) throw new HarborError('UPSTREAM_ERROR', `Couldn't list the sandbox's files: ${r.stderr.slice(0, 200)}`);
    return parseListing(r.stdout);
  }

  /** Make the sandbox match Harbor's files, leaving the app's own data alone. */
  async push(): Promise<number> {
    const local = await localHashes(this.ws);
    const current = await this.list();
    // Anything that changed in the sandbox since Harbor last synced was written by the running app (or was there before
    // Harbor connected): it belongs to the sandbox, unless it's one of Harbor's own files.
    for (const [p, h] of current) {
      if (!local.has(p) && (!this.remote || this.remote.get(p) !== h)) this.sandboxOnly.add(p);
    }
    const changed = [...local].filter(([p, f]) => current.get(p) !== f.hash).map(([path, f]) => ({ path: `${REMOTE_ROOT}/${path}`, content: f.bytes }));
    const gone = [...current.keys()].filter((p) => !local.has(p) && !this.sandboxOnly.has(p) && !isData(p));
    for (let i = 0; i < changed.length; i += 50) await this.box.writeFiles(changed.slice(i, i + 50));
    if (gone.length) await this.box.run(`rm -f -- ${gone.map((p) => q(p)).join(' ')}`, { cwd: REMOTE_ROOT, timeoutMs: 60_000 });
    this.remote = new Map([...local].map(([p, f]) => [p, f.hash]));
    for (const [p, h] of current) if (!local.has(p) && !gone.includes(p)) this.remote.set(p, h);
    return changed.length + gone.length;
  }

  /** Bring back what a command changed (never the app's data). Returns notes for the agent. */
  async pull(): Promise<string[]> {
    const before = this.remote ?? new Map();
    const after = await this.list();
    const notes: string[] = [];
    const changed = [...after].filter(([p, h]) => before.get(p) !== h && !isData(p) && !this.sandboxOnly.has(p));
    if (changed.length > MAX_PULL) notes.push(`${changed.length - MAX_PULL} more changed files weren't copied back (limit ${MAX_PULL} per command).`);
    for (const [path] of changed.slice(0, MAX_PULL)) {
      const bytes = await this.box.readFile(`${REMOTE_ROOT}/${path}`);
      if (!bytes) continue;
      if (bytes.length > MAX_FILE_BYTES) {
        this.sandboxOnly.add(path);
        notes.push(`${path} stays in the sandbox only (over 512 KB).`);
        continue;
      }
      try {
        await this.ws.write(path, bytes);
      } catch (err) {
        this.sandboxOnly.add(path);
        notes.push(`${path} wasn't copied back: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    for (const p of before.keys()) {
      if (after.has(p)) continue;
      this.sandboxOnly.delete(p);
      if (!isData(p)) await this.ws.remove(p).catch(() => undefined);
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
    return { exitCode: r.exitCode, stdout: cap(this.scrub(r.stdout)), stderr: cap(this.scrub(r.stderr) + (notes.length ? `\n[harbor] ${notes.join('\n[harbor] ')}` : '')), timedOut };
  }

  /**
   * Start the app's dev server (package.json "dev", else "start") on the preview port and return its public address.
   * Undefined when the project has no server to run (a static site: the static preview shows it).
   */
  async preview(opts?: { env?: Record<string, string> }): Promise<string | undefined> {
    let pkg: { scripts?: Record<string, string> } = {};
    try {
      pkg = JSON.parse(await this.ws.read('package.json'));
    } catch {
      return undefined;
    }
    const script = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : undefined;
    if (!script) return undefined;
    this.box = await this.boxes.connect(this.name); // resumes a stopped sandbox, with fresh routes
    const changed = await this.push();
    const env = { PORT: String(PREVIEW_PORT), HOST: '0.0.0.0', NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
    const isUp = async () => (await this.box.run(`curl -s -o /dev/null -m 2 http://127.0.0.1:${PREVIEW_PORT}/ && echo up`, { cwd: REMOTE_ROOT, timeoutMs: 10_000 })).stdout.includes('up');
    let up = await isUp();
    // The app's settings, as a fingerprint kept in the sandbox (never the values themselves).
    const secrets = opts?.env ?? {};
    const fingerprint = createHash('sha256').update(JSON.stringify(Object.entries(secrets).sort())).digest('hex').slice(0, 16);
    const runningWith = up ? (await this.box.run('cat /tmp/harbor-dev.settings 2>/dev/null', { cwd: REMOTE_ROOT, timeoutMs: 10_000 })).stdout.trim() : '';
    // Files or settings changed since it started (a build, a restore, a new key): restart so the preview is current.
    if (up && (changed > 0 || runningWith !== fingerprint)) {
      await this.box.run(stopServer(), { cwd: REMOTE_ROOT, timeoutMs: 20_000 });
      up = false;
    }
    if (!up) {
      // Install only when the app lists packages and they aren't there yet (the starter has none).
      const install = await this.box.run(INSTALL_IF_NEEDED, { cwd: REMOTE_ROOT, timeoutMs: 300_000, env });
      if (install.exitCode !== 0) throw new HarborError('UPSTREAM_ERROR', `Installing the app's packages failed: ${install.stderr.slice(-300)}`);
      await this.box.run(`echo ${fingerprint} > /tmp/harbor-dev.settings`, { cwd: REMOTE_ROOT, timeoutMs: 10_000 });
      await this.box.start(startServer(script), { cwd: REMOTE_ROOT, env: { ...secrets, ...env } });
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
          await box.run(`mkdir -p ${REMOTE_ROOT}`, { cwd: '/vercel', timeoutMs: 30_000 });
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
/** Sign in through this machine's Vercel CLI login: short-lived tokens for the team and project, refreshed as needed. */
export interface VercelCliLogin { cli: true; teamId: string; projectId: string }
export type VercelAuth = VercelCredentials | VercelCliLogin | 'oidc';

/**
 * Credentials from the environment, in order:
 * - VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID: an access token (production);
 * - VERCEL_OIDC_TOKEN: a token from `vercel env pull`;
 * - HARBOR_SANDBOX=vercel with VERCEL_TEAM_ID + VERCEL_PROJECT_ID and no token: this machine's Vercel CLI login
 *   (`vercel login`), which mints short-lived tokens for that project. For development; no token to create or store.
 * Undefined otherwise: Harbor then never calls Vercel, so no interactive sign-in can start.
 */
export function vercelCredentialsFromEnv(env: Record<string, string | undefined> = process.env): VercelAuth | undefined {
  const token = env.VERCEL_TOKEN?.trim();
  const teamId = env.VERCEL_TEAM_ID?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  if (token) throw new Error('Vercel Sandbox needs VERCEL_TEAM_ID and VERCEL_PROJECT_ID along with VERCEL_TOKEN.');
  if (env.VERCEL_OIDC_TOKEN?.trim()) return 'oidc';
  // The team and project alone just mean "not connected", unless HARBOR_SANDBOX=vercel asks for the CLI login.
  if (teamId && projectId && env.HARBOR_SANDBOX?.trim().toLowerCase() === 'vercel') return { cli: true, teamId, projectId };
  return undefined;
}

/** Tokens from the CLI login last 12 hours; reconnect well before, so a long-lived sandbox handle never goes stale. */
const REFRESH_MS = 60 * 60_000;

export function realVercelBoxes(creds: VercelAuth): RemoteBoxes {
  const auth = async (): Promise<Partial<VercelCredentials>> => {
    if (creds === 'oidc') return {};
    if ('cli' in creds) {
      const { getVercelOidcToken } = await import('@vercel/oidc');
      return { token: await getVercelOidcToken({ team: creds.teamId, project: creds.projectId }), teamId: creds.teamId, projectId: creds.projectId };
    }
    return creds;
  };
  const load = () => import('@vercel/sandbox');
  const wrap = (first: import('@vercel/sandbox').Sandbox, name: string): RemoteBox => {
    let sb = first;
    let at = Date.now();
    const fresh = async () => {
      if (Date.now() - at > REFRESH_MS) {
        const { Sandbox } = await load();
        sb = await Sandbox.get({ ...(await auth()), name } as Parameters<typeof Sandbox.get>[0]);
        at = Date.now();
      }
      return sb;
    };
    return {
      async run(command, opts) {
        // The sandbox kills the command (SIGKILL) at timeoutMs, so nothing keeps running after Harbor stops waiting.
        const r = await (await fresh()).runCommand({ cmd: 'sh', args: ['-lc', command], cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}), timeoutMs: opts.timeoutMs });
        const [stdout, stderr] = await Promise.all([r.stdout().catch(() => ''), r.stderr().catch(() => '')]);
        return { exitCode: r.exitCode, stdout, stderr };
      },
      async start(command, opts) {
        await (await fresh()).runCommand({ cmd: 'sh', args: ['-lc', command], cwd: opts.cwd, ...(opts.env ? { env: opts.env } : {}), detached: true });
      },
      writeFiles: async (files) => (await fresh()).writeFiles(files),
      readFile: async (path) => (await fresh()).readFileToBuffer({ path }),
      domain: (port) => sb.domain(port),
      async stop() {
        await (await fresh()).stop();
      },
    };
  };
  return {
    async connect(name) {
      const { Sandbox } = await load();
      const sb = await Sandbox.getOrCreate({
        ...(await auth()),
        name,
        ports: [PREVIEW_PORT],
        timeout: 30 * 60_000,
        resources: { vcpus: 2 },
        persistent: true,
        networkPolicy: { allow: ALLOWED_HOSTS },
        tags: { app: 'harbor' },
      } as Parameters<typeof Sandbox.getOrCreate>[0]);
      // A sandbox made before the allowed hosts changed keeps its old rules: bring them up to date.
      const allow = (sb.networkPolicy as { allow?: unknown } | undefined)?.allow;
      if (JSON.stringify(allow) !== JSON.stringify(ALLOWED_HOSTS)) await sb.updateNetworkPolicy({ allow: ALLOWED_HOSTS });
      return wrap(sb, name);
    },
    async destroy(name) {
      const { Sandbox } = await load();
      const sb = await Sandbox.get({ ...(await auth()), name } as Parameters<typeof Sandbox.get>[0]).catch(() => undefined);
      await sb?.delete();
    },
  };
}

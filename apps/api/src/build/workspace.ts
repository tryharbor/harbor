import { execFile } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HarborError } from '@harbor/core';

/**
 * A Full app project's files on disk, and their history in git. Harbor itself only reads and writes files here and
 * runs git; it never runs the project's code (that happens only inside a sandbox). Every path is checked to stay
 * inside the project, `.git` is off limits, and git runs with hooks and fsmonitor disabled, so nothing the agent
 * writes can make Harbor execute it.
 */

const run = promisify(execFile);

/** apps/api/.projects (gitignored), unless HARBOR_PROJECTS_DIR says otherwise. */
export const DEFAULT_PROJECTS_DIR = fileURLToPath(new URL('../../.projects', import.meta.url));
export const projectsDirFromEnv = (env: Record<string, string | undefined> = process.env) => resolve(env.HARBOR_PROJECTS_DIR || DEFAULT_PROJECTS_DIR);

/** Files the agent may not touch, and folders it never sees in listings. */
const FORBIDDEN = /(^|\/)\.git(\/|$)/;
const HIDDEN_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', '.cache']);
export const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 2000;

export interface Commit { sha: string; message: string; at: string }

export class Workspace {
  constructor(readonly root: string) {}

  static async open(projectsDir: string, projectId: string): Promise<Workspace> {
    if (!/^[a-z]{3}_[a-z0-9]+$/.test(projectId)) throw new HarborError('INVALID_REQUEST', 'Bad project id.');
    const root = join(projectsDir, projectId);
    await mkdir(root, { recursive: true });
    return new Workspace(await realpath(root));
  }

  /**
   * The absolute path for a project-relative path, or a 400. Rejects absolute paths, `..`, `.git`, and anything that
   * resolves outside the project through a symlink (a sandbox can create those in the mounted folder).
   */
  async resolve(path: string): Promise<string> {
    const clean = path.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
    if (!clean || clean.startsWith('/') || clean.split('/').includes('..') || FORBIDDEN.test(clean) || clean.includes('\0')) {
      throw new HarborError('INVALID_REQUEST', `path: "${path}" isn't a file inside the project.`);
    }
    const abs = resolve(this.root, clean);
    if (!abs.startsWith(this.root + sep)) throw new HarborError('INVALID_REQUEST', `path: "${path}" is outside the project.`);
    // The deepest existing ancestor must really be inside the project (no symlinked directories leading out).
    let probe = abs;
    for (;;) {
      try {
        const real = await realpath(probe);
        if (real !== this.root && !real.startsWith(this.root + sep)) throw new HarborError('INVALID_REQUEST', `path: "${path}" leads outside the project.`);
        break;
      } catch (err) {
        if (err instanceof HarborError) throw err;
        const up = dirname(probe);
        if (up === probe) break;
        probe = up;
      }
    }
    return abs;
  }

  async read(path: string): Promise<string> {
    const abs = await this.resolve(path);
    let s;
    try {
      s = await lstat(abs);
    } catch {
      throw new HarborError('NOT_FOUND', `${path} doesn't exist.`);
    }
    if (!s.isFile()) throw new HarborError('INVALID_REQUEST', `${path} isn't a file.`);
    if (s.size > MAX_FILE_BYTES) throw new HarborError('INVALID_REQUEST', `${path} is too big to read (${Math.round(s.size / 1024)} KB).`);
    return readFile(abs, 'utf8');
  }

  /** Bytes, for serving the static preview. */
  async readBytes(path: string): Promise<Buffer> {
    const abs = await this.resolve(path);
    const s = await lstat(abs).catch(() => undefined);
    if (!s?.isFile()) throw new HarborError('NOT_FOUND', `${path} doesn't exist.`);
    if (s.size > 10 * 1024 * 1024) throw new HarborError('INVALID_REQUEST', `${path} is too big.`);
    return readFile(abs);
  }

  async write(path: string, content: string | Buffer): Promise<void> {
    if ((typeof content === 'string' ? Buffer.byteLength(content) : content.length) > MAX_FILE_BYTES) throw new HarborError('INVALID_REQUEST', `${path} is too big (limit 512 KB).`);
    const abs = await this.resolve(path);
    const existing = await lstat(abs).catch(() => undefined);
    if (existing && !existing.isFile()) throw new HarborError('INVALID_REQUEST', `${path} isn't a regular file.`);
    await mkdir(dirname(abs), { recursive: true });
    await this.resolve(path); // re-check after creating folders
    await writeFile(abs, content);
  }

  async remove(path: string): Promise<void> {
    const abs = await this.resolve(path);
    const s = await lstat(abs).catch(() => undefined);
    if (!s) throw new HarborError('NOT_FOUND', `${path} doesn't exist.`);
    if (s.isDirectory()) throw new HarborError('INVALID_REQUEST', `${path} is a folder; delete its files instead.`);
    await rm(abs);
  }

  /** Every file, project-relative, sorted; build output and dependencies left out. */
  async list(): Promise<{ path: string; bytes: number }[]> {
    const out: { path: string; bytes: number }[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (out.length >= MAX_FILES) return;
        if (e.isSymbolicLink()) continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
          if (!HIDDEN_DIRS.has(e.name)) await walk(abs);
        } else if (e.isFile()) out.push({ path: relative(this.root, abs).split(sep).join('/'), bytes: (await stat(abs)).size });
      }
    };
    await walk(this.root);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  // ---- git ----

  private git(args: string[]) {
    return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'user.name=Harbor', '-c', 'user.email=builder@harbor.local', '-c', 'commit.gpgsign=false', ...args], {
      cwd: this.root,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: this.root, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
      maxBuffer: 4 * 1024 * 1024,
    });
  }

  async initGit(): Promise<void> {
    const has = await lstat(join(this.root, '.git')).catch(() => undefined);
    if (!has) await this.git(['init', '-q', '-b', 'main']);
  }

  /** Commit everything; returns the new sha, or undefined when nothing changed. */
  async commit(message: string): Promise<string | undefined> {
    await this.git(['add', '-A']);
    const { stdout } = await this.git(['status', '--porcelain']);
    if (!stdout.trim()) return undefined;
    await this.git(['commit', '-q', '-m', message.slice(0, 500)]);
    return (await this.git(['rev-parse', 'HEAD'])).stdout.trim();
  }

  async history(limit = 50): Promise<Commit[]> {
    try {
      const { stdout } = await this.git(['log', `-n${limit}`, '--format=%H%x1f%cI%x1f%s']);
      return stdout.split('\n').filter(Boolean).map((l) => {
        const [sha, at, message] = l.split('\x1f');
        return { sha: sha!, at: at!, message: message ?? '' };
      });
    } catch {
      return [];
    }
  }

  /** Put the files back as they were at `sha`, as a new commit (history is kept). */
  async restore(sha: string): Promise<string | undefined> {
    if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new HarborError('INVALID_REQUEST', 'Bad version id.');
    const known = (await this.history(500)).some((c) => c.sha.startsWith(sha));
    if (!known) throw new HarborError('NOT_FOUND', `Version ${sha.slice(0, 7)} isn't in this project's history.`);
    // Remove tracked files, then check out the old tree, so files added since are gone too.
    await this.git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '.']);
    for (const f of await this.list()) await rm(join(this.root, f.path), { force: true });
    await this.git(['checkout', sha, '--', '.']);
    return this.commit(`Restore version ${sha.slice(0, 7)}`);
  }
}

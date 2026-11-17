import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HarborError } from '@harbor/core';

/**
 * Where a Full app project's code runs. Harbor never runs project code on its own machine: commands go to a sandbox,
 * one per project, with the project's folder mounted as its only writable path. The interface lets the provider change
 * (Docker on a developer's machine now; a hosted sandbox service in production) without touching the agent.
 */

export interface ExecResult { exitCode: number; stdout: string; stderr: string; timedOut: boolean }

export interface Sandbox {
  /** Run a shell command in the project folder. Output is capped; the command is killed at the timeout. */
  exec(command: string, opts?: { timeoutMs?: number }): Promise<ExecResult>;
  /** Start the dev server (if any) and return the URL that shows it. */
  preview(): Promise<string | undefined>;
  stop(): Promise<void>;
}

export interface SandboxProvider {
  readonly kind: 'none' | 'docker';
  /** False when this machine can't run sandboxes (no Docker); commands then fail with a clear message. */
  available(): Promise<boolean>;
  /** The project's sandbox, started if needed. */
  forProject(projectId: string, workspaceRoot: string): Promise<Sandbox>;
}

const OUTPUT_LIMIT = 20_000;
const cap = (s: string) => (s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT / 2)}\n… (output cut) …\n${s.slice(-OUTPUT_LIMIT / 2)}` : s);

/** No sandbox on this machine: nothing runs, and the agent is told why. */
export const noSandbox: SandboxProvider = {
  kind: 'none',
  available: async () => false,
  forProject: async () => {
    throw new HarborError('CONFLICT', 'Running commands needs a sandbox. Install Docker on this machine (or connect a hosted sandbox) to run code.');
  },
};

/** How Harbor calls the Docker CLI. Tests inject a fake to check the exact commands. */
export type DockerRunner = (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

const execFileP = promisify(execFile);
export const realDocker: DockerRunner = async (args, opts) => {
  try {
    const { stdout, stderr } = await execFileP('docker', args, { timeout: opts?.timeoutMs ?? 120_000, maxBuffer: 8 * 1024 * 1024 });
    return { exitCode: 0, stdout, stderr, timedOut: false };
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    return { exitCode: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(err), timedOut: !!e.killed || e.signal === 'SIGTERM' };
  }
};

export const DOCKER_IMAGE = 'node:22-slim';
export const PREVIEW_PORT = 3000;
export const containerName = (projectId: string) => `harbor-${projectId.replace(/[^a-z0-9_]/g, '')}`;

/**
 * The `docker run` for a project's sandbox: a long-lived container with the project folder at /workspace and nothing
 * else of the host. No privileges, no new privileges, every Linux capability dropped, a non-root user, memory, CPU and
 * process limits, and the preview port published on this machine's loopback only. Egress is Docker's default network,
 * so package installs work; a production sandbox restricts it further.
 */
export function dockerRunArgs(projectId: string, workspaceRoot: string): string[] {
  return [
    'run', '-d', '--rm',
    '--name', containerName(projectId),
    '--label', 'harbor.project=' + projectId,
    '--user', '1000:1000',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--memory', '1g', '--cpus', '1', '--pids-limit', '256',
    '--read-only', '--tmpfs', '/tmp:rw,size=256m', '--tmpfs', '/home/node:rw,size=256m',
    '-e', 'HOME=/home/node', '-e', 'NPM_CONFIG_UPDATE_NOTIFIER=false', '-e', `PORT=${PREVIEW_PORT}`,
    '-v', `${workspaceRoot}:/workspace:rw`,
    '-w', '/workspace',
    '-p', `127.0.0.1::${PREVIEW_PORT}`,
    DOCKER_IMAGE, 'sleep', 'infinity',
  ];
}

export function dockerSandboxes(docker: DockerRunner = realDocker): SandboxProvider {
  return {
    kind: 'docker',
    async available() {
      return (await docker(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 10_000 })).exitCode === 0;
    },
    async forProject(projectId, workspaceRoot) {
      const name = containerName(projectId);
      const running = await docker(['inspect', '-f', '{{.State.Running}}', name], { timeoutMs: 10_000 });
      if (running.exitCode !== 0 || running.stdout.trim() !== 'true') {
        const started = await docker(dockerRunArgs(projectId, workspaceRoot), { timeoutMs: 180_000 });
        if (started.exitCode !== 0) throw new HarborError('UPSTREAM_ERROR', `The sandbox didn't start: ${started.stderr.slice(0, 300)}`);
      }
      return {
        async exec(command, opts) {
          const timeoutMs = Math.min(opts?.timeoutMs ?? 120_000, 600_000);
          const r = await docker(['exec', '-w', '/workspace', name, 'sh', '-lc', command], { timeoutMs });
          return { ...r, stdout: cap(r.stdout), stderr: cap(r.stderr) };
        },
        async preview() {
          const port = await docker(['port', name, String(PREVIEW_PORT)], { timeoutMs: 10_000 });
          const m = /127\.0\.0\.1:(\d+)/.exec(port.stdout);
          return m ? `http://127.0.0.1:${m[1]}` : undefined;
        },
        async stop() {
          await docker(['stop', '-t', '5', name], { timeoutMs: 30_000 });
        },
      };
    },
  };
}

/** Docker when this machine has it (HARBOR_SANDBOX=docker forces it, =none turns sandboxes off). */
export function sandboxesFromEnv(env: Record<string, string | undefined> = process.env): SandboxProvider {
  const v = (env.HARBOR_SANDBOX ?? 'docker').trim().toLowerCase();
  return v === 'none' ? noSandbox : dockerSandboxes();
}

import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sandboxesFromEnv } from '../src/build/sandbox.ts';
import { LIST_COMMAND, REMOTE_ROOT, boxName, parseListing, vercelCredentialsFromEnv, vercelSandboxes, type RemoteBox, type RemoteBoxes } from '../src/build/vercel-sandbox.ts';
import { Workspace } from '../src/build/workspace.ts';

/**
 * A fake Vercel sandbox: an in-memory file system under REMOTE_ROOT that understands the commands Harbor itself sends
 * (list, rm, mkdir, the dev-server check) and lets each test script what the agent's commands do.
 */
class FakeBox implements RemoteBox {
  files = new Map<string, Buffer>();
  commands: string[] = [];
  started: string[] = [];
  serverUp = false;
  stopped = false;
  onRun: (cmd: string, box: FakeBox) => { exitCode: number; stdout: string; stderr: string } | undefined = () => undefined;

  async run(command: string) {
    this.commands.push(command);
    if (command === LIST_COMMAND) {
      const lines = [...this.files]
        .filter(([p]) => !p.split('/').some((x) => x === 'node_modules'))
        .map(([p, b]) => `${createHash('sha256').update(b).digest('hex')}  ./${p}`);
      return { exitCode: 0, stdout: lines.join('\n'), stderr: '' };
    }
    if (command.startsWith('rm -f -- ')) {
      for (const m of command.matchAll(/'([^']*)'/g)) this.files.delete(m[1]!);
      return { exitCode: 0, stdout: '', stderr: '' };
    }
    if (command.startsWith('mkdir -p') || command.startsWith('test -d node_modules')) return { exitCode: 0, stdout: '', stderr: '' };
    if (command.startsWith('curl')) return { exitCode: 0, stdout: this.serverUp ? 'up' : '', stderr: '' };
    return this.onRun(command, this) ?? { exitCode: 0, stdout: `ran ${command}`, stderr: '' };
  }
  async start(command: string) {
    this.started.push(command);
    this.serverUp = true;
  }
  async writeFiles(files: { path: string; content: Buffer }[]) {
    for (const f of files) this.files.set(f.path.slice(REMOTE_ROOT.length + 1), Buffer.from(f.content));
  }
  async readFile(path: string) {
    return this.files.get(path.slice(REMOTE_ROOT.length + 1)) ?? null;
  }
  domain(port: number) {
    return `https://sb-${port}.vercel.run`;
  }
  async stop() {
    this.stopped = true;
  }
}

function fakeBoxes() {
  const box = new FakeBox();
  const destroyed: string[] = [];
  const connected: string[] = [];
  const boxes: RemoteBoxes = {
    connect: async (name) => {
      connected.push(name);
      return box;
    },
    destroy: async (name) => {
      destroyed.push(name);
    },
  };
  return { box, boxes, destroyed, connected };
}

let dir: string;
let ws: Workspace;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harbor-vercel-'));
  ws = await Workspace.open(dir, 'prj_test1');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('choosing the sandbox from the environment', () => {
  it('uses Vercel when its credentials are set, Docker otherwise, and nothing when told', () => {
    expect(sandboxesFromEnv({ VERCEL_TOKEN: 't', VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'prj' }).kind).toBe('vercel');
    expect(sandboxesFromEnv({ VERCEL_OIDC_TOKEN: 'x.y.z' }).kind).toBe('vercel');
    expect(sandboxesFromEnv({}).kind).toBe('docker');
    expect(sandboxesFromEnv({ HARBOR_SANDBOX: 'none', VERCEL_OIDC_TOKEN: 'x' }).kind).toBe('none');
    expect(sandboxesFromEnv({ HARBOR_SANDBOX: 'docker', VERCEL_OIDC_TOKEN: 'x' }).kind).toBe('docker');
  });

  it('refuses half-set credentials and a Vercel request without them', () => {
    expect(() => vercelCredentialsFromEnv({ VERCEL_TOKEN: 't' })).toThrow(/along with VERCEL_TOKEN/);
    expect(vercelCredentialsFromEnv({ VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'prj' })).toBeUndefined();
    expect(vercelCredentialsFromEnv({ VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'prj', HARBOR_SANDBOX: 'vercel' })).toEqual({ cli: true, teamId: 'team', projectId: 'prj' });
    expect(sandboxesFromEnv({ VERCEL_TEAM_ID: 'team', VERCEL_PROJECT_ID: 'prj', HARBOR_SANDBOX: 'vercel' }).kind).toBe('vercel');
    expect(() => sandboxesFromEnv({ HARBOR_SANDBOX: 'vercel' })).toThrow(/needs VERCEL_TEAM_ID/);
    expect(() => sandboxesFromEnv({ HARBOR_SANDBOX: 'kubernetes' })).toThrow(/must be/);
  });

  it('names sandboxes after the project', () => {
    expect(boxName('prj_abc123')).toBe('harbor-prj-abc123');
  });
});

describe('parseListing', () => {
  it('reads sha256sum lines and skips escaped names', () => {
    const h = 'a'.repeat(64);
    const m = parseListing(`${h}  ./index.html\n${h}  ./src/app.js\n\\${h}  ./odd\\nname\n`);
    expect([...m.keys()]).toEqual(['index.html', 'src/app.js']);
  });
});

describe('a project on Vercel Sandbox', () => {
  it('pushes Harbor’s files before a command and brings back what it changed', async () => {
    const { box, boxes } = fakeBoxes();
    await ws.write('index.html', '<main>hi</main>');
    await ws.write('old.txt', 'to be removed by the command');
    box.onRun = (cmd, b) => {
      if (cmd !== 'npm run build-ish') return undefined;
      expect(b.files.get('index.html')?.toString()).toBe('<main>hi</main>');
      b.files.set('package.json', Buffer.from('{"name":"x"}'));
      b.files.set('index.html', Buffer.from('<main>changed</main>'));
      b.files.set('node_modules/x/index.js', Buffer.from('dependency'));
      b.files.delete('old.txt');
      return { exitCode: 0, stdout: 'built', stderr: '' };
    };
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    const r = await sb.exec('npm run build-ish');
    expect(r).toMatchObject({ exitCode: 0, stdout: 'built', timedOut: false });
    expect(await ws.read('index.html')).toBe('<main>changed</main>');
    expect(await ws.read('package.json')).toBe('{"name":"x"}');
    expect((await ws.list()).map((f) => f.path)).toEqual(['index.html', 'package.json']);
  });

  it('sends only what changed, and deletes in the sandbox what Harbor deleted', async () => {
    const { box, boxes } = fakeBoxes();
    await ws.write('a.txt', 'a');
    await ws.write('b.txt', 'b');
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    await sb.exec('true');
    const writes: string[] = [];
    const orig = box.writeFiles.bind(box);
    box.writeFiles = async (files) => {
      writes.push(...files.map((f) => f.path));
      return orig(files);
    };
    await ws.write('b.txt', 'b2');
    await ws.remove('a.txt');
    await sb.exec('true');
    expect(writes).toEqual([`${REMOTE_ROOT}/b.txt`]);
    expect([...box.files.keys()]).toEqual(['b.txt']);
  });

  it('keeps big files in the sandbox only, and doesn’t delete them on the next push', async () => {
    const { box, boxes } = fakeBoxes();
    box.onRun = (cmd, b) => {
      if (cmd === 'npm install') b.files.set('package-lock.json', Buffer.alloc(600 * 1024, 'x'));
      return undefined;
    };
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    const r = await sb.exec('npm install');
    expect(r.stderr).toContain('package-lock.json stays in the sandbox only');
    expect((await ws.list()).length).toBe(0);
    await sb.exec('true');
    expect(box.files.has('package-lock.json')).toBe(true);
  });

  it('never writes outside the project, whatever the sandbox reports', async () => {
    const { box, boxes } = fakeBoxes();
    box.onRun = (cmd, b) => {
      if (cmd === 'evil') {
        b.files.set('../escape.txt', Buffer.from('nope'));
        b.files.set('.git/config', Buffer.from('[core]\nhooksPath=/tmp'));
      }
      return undefined;
    };
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    const r = await sb.exec('evil');
    expect(r.stderr).toContain("wasn't copied back");
    expect((await ws.list()).length).toBe(0);
    await expect(rm(join(dir, 'escape.txt'))).rejects.toThrow();
  });

  it('reports a timeout', async () => {
    const { box, boxes } = fakeBoxes();
    box.onRun = (cmd) => (cmd === 'sleep 999' ? { exitCode: 137, stdout: '', stderr: '' } : undefined);
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    const realNow = Date.now;
    let calls = 0;
    Date.now = () => realNow() + (calls++ > 0 ? 5_000 : 0);
    try {
      expect((await sb.exec('sleep 999', { timeoutMs: 5_000 })).timedOut).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  it('has no live preview for a static site, and starts the dev server for an app', async () => {
    const { box, boxes } = fakeBoxes();
    const sb = await vercelSandboxes(boxes).forProject('prj_test1', ws.root);
    await ws.write('index.html', '<main></main>');
    expect(await sb.preview()).toBeUndefined();

    await ws.write('package.json', JSON.stringify({ scripts: { dev: 'node server.js' } }));
    expect(await sb.preview()).toBe('https://sb-3000.vercel.run');
    expect(box.started).toEqual(['npm run dev > /tmp/harbor-dev.log 2>&1']);
    expect(box.files.has('package.json')).toBe(true);

    // Already running: not started twice.
    expect(await sb.preview()).toBe('https://sb-3000.vercel.run');
    expect(box.started.length).toBe(1);
  });

  it('deletes the sandbox when the project goes', async () => {
    const { boxes, destroyed } = fakeBoxes();
    const provider = vercelSandboxes(boxes);
    await provider.release!('prj_test1');
    expect(destroyed).toEqual(['harbor-prj-test1']);
  });
});

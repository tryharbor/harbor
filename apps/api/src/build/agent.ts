import { HarborError, type Brand } from '@harbor/core';
import { CATALOG, PROVIDERS, memoryBrief, type LlmProvider } from '@harbor/ai';
import type { Sandbox } from './sandbox.ts';
import type { Workspace } from './workspace.ts';

/**
 * The Full app builder's agent loop, the same on every provider. Each step the model answers with JSON: a short
 * message for the owner and a list of actions (write, read, list or delete a file, run a command, done). Harbor carries
 * the actions out in the project's workspace or sandbox and feeds the results back. The loop stops at "done", at the
 * build's cost cap, at the step limit, or when the owner stops it.
 */

export const TOOLS = ['write_file', 'read_file', 'list_files', 'delete_file', 'run', 'done'] as const;
export type Tool = (typeof TOOLS)[number];
export interface Action { tool: Tool; path?: string; content?: string; command?: string }

export interface BuildStep {
  at: string;
  kind: 'message' | 'action' | 'result' | 'error';
  text: string;
  tool?: Tool;
  path?: string;
}

export interface BuildOutcome {
  status: 'succeeded' | 'failed' | 'budget' | 'stopped' | 'steps';
  summary: string;
  inputTokens: number;
  outputTokens: number;
  /** List price, in cents (fractions kept). */
  costCents: number;
  model: string;
}

export interface BuildContext {
  brand: Brand;
  projectName: string;
  request: string;
  /** Earlier requests and what came of them, oldest first. */
  earlier: { request: string; summary: string }[];
  workspace: Workspace;
  /** The project's sandbox, or an error saying why commands can't run here. */
  sandbox: () => Promise<Sandbox>;
  canRun: boolean;
  /** What's left of the cost cap for this build, in cents. */
  budgetCents: number;
  maxSteps?: number;
  onStep: (s: BuildStep) => Promise<void>;
  /** True once the owner pressed Stop. */
  stopped: () => boolean;
}

/** List price per million tokens; models without a published price are estimated high, so caps err on the safe side. */
export function priceFor(model: string): { input: number; output: number; estimated: boolean } {
  const known = PROVIDERS.flatMap((p) => CATALOG[p].models).find((m) => m.id === model)?.price;
  return known ? { ...known, estimated: false } : { input: 5, output: 25, estimated: true };
}
export const costCents = (model: string, inputTokens: number, outputTokens: number) => {
  const p = priceFor(model);
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000) * 100;
};

const now = () => new Date().toISOString();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n… (cut, ${s.length - n} more characters)` : s);

/** Carry out one action. Errors become results the model can read and recover from. */
async function act(ctx: BuildContext, a: Action): Promise<string> {
  try {
    switch (a.tool) {
      case 'write_file':
        if (!a.path || a.content === undefined) return 'write_file needs path and content.';
        await ctx.workspace.write(a.path, a.content);
        return `Wrote ${a.path} (${a.content.length} characters).`;
      case 'read_file':
        if (!a.path) return 'read_file needs path.';
        return clip(await ctx.workspace.read(a.path), 12_000);
      case 'list_files':
        return (await ctx.workspace.list()).map((f) => `${f.path} (${f.bytes} B)`).join('\n') || '(no files)';
      case 'delete_file':
        if (!a.path) return 'delete_file needs path.';
        await ctx.workspace.remove(a.path);
        return `Deleted ${a.path}.`;
      case 'run': {
        if (!a.command) return 'run needs command.';
        if (!ctx.canRun) return 'Commands can’t run here: this machine has no sandbox. Work with files only; the static preview shows them.';
        const r = await (await ctx.sandbox()).exec(a.command, { timeoutMs: 180_000 });
        return clip(`exit ${r.exitCode}${r.timedOut ? ' (timed out)' : ''}\n${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`, 6_000);
      }
      case 'done':
        return 'Done.';
    }
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const SYSTEM = (ctx: BuildContext) => `You are Harbor's app builder. You build small, working web apps for a small business, in the project's files.
Work in small steps. Write complete files, never fragments. Keep it basic: plain HTML, CSS and JavaScript unless the project already uses something else. If the project has a README.md, read it first and follow how the app is laid out; prefer what Node has built in over adding packages.
In a static site (no server), link the project's own files with relative paths (styles.css, not /styles.css): the static preview serves it under a sub-path. A server app serves its own paths.
${ctx.canRun ? 'You can run shell commands in the project folder with "run" (Node and npm are installed; only package registries are reachable). For a server app, give package.json a "dev" script that listens on process.env.PORT (3000) and host 0.0.0.0: Harbor runs it for the owner\'s live preview. A plain index.html needs no server. Save anything the app stores while running (orders, sign-ups) in its database, or under data/: it stays in the sandbox, out of the project files.' : 'You cannot run commands here; write files only. The owner sees a live static preview of index.html.'}
Use the business's real facts, offer and brand colours from the brief; invent no facts, prices or testimonials (use clearly marked placeholders).
Answer with JSON only: {"message": a one-sentence progress note for a non-technical owner, "actions": [...]}.
Actions: write_file {path, content}, read_file {path}, list_files {}, delete_file {path}, run {command}, done {} (last, when the request is met; the message is then your summary for the owner).

Business brief:
${memoryBrief(ctx.brand)}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'actions'],
  properties: {
    message: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tool'],
        properties: { tool: { type: 'string', enum: [...TOOLS] }, path: { type: 'string' }, content: { type: 'string' }, command: { type: 'string' } },
      },
    },
  },
};

/** The agent on a real model, through any provider. */
export async function runAgent(llm: LlmProvider, model: string, ctx: BuildContext): Promise<BuildOutcome> {
  const maxSteps = ctx.maxSteps ?? 25;
  const transcript: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const spent = () => costCents(model, inputTokens, outputTokens);
  const outcome = (status: BuildOutcome['status'], summary: string): BuildOutcome => ({ status, summary, inputTokens, outputTokens, costCents: spent(), model });

  for (let step = 1; step <= maxSteps; step++) {
    if (ctx.stopped()) return outcome('stopped', 'Stopped before finishing.');
    if (spent() >= ctx.budgetCents) return outcome('budget', 'Paused at the build’s cost cap. Raise the cap or ask for something smaller.');
    const files = (await ctx.workspace.list()).map((f) => f.path).join('\n') || '(empty)';
    const prompt = [
      `Project: ${ctx.projectName}`,
      ctx.earlier.length ? `Earlier requests:\n${ctx.earlier.slice(-5).map((e) => `- ${e.request} → ${e.summary}`).join('\n')}` : '',
      `Request: ${ctx.request}`,
      `Files:\n${files}`,
      transcript.length ? `What you've done so far (most recent last):\n${clip(transcript.join('\n\n'), 40_000)}` : 'Start.',
      `Step ${step} of at most ${maxSteps}.`,
    ].filter(Boolean).join('\n\n');

    let res;
    try {
      res = await llm.complete(model, { system: SYSTEM(ctx), prompt, schema: SCHEMA, schemaName: 'build_step', maxTokens: 32_000, effort: 'high' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.onStep({ at: now(), kind: 'error', text: msg });
      return outcome('failed', msg);
    }
    inputTokens += res.usage.inputTokens;
    outputTokens += res.usage.outputTokens;

    let parsed: { message?: unknown; actions?: unknown };
    try {
      parsed = JSON.parse(res.text);
    } catch {
      transcript.push('Your last answer was not valid JSON. Answer with the JSON object only.');
      await ctx.onStep({ at: now(), kind: 'error', text: 'The model answered with something that isn’t JSON; asking again.' });
      continue;
    }
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
    const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).filter((a): a is Action => !!a && typeof a === 'object' && (TOOLS as readonly string[]).includes((a as Action).tool)).slice(0, 12);
    if (message) await ctx.onStep({ at: now(), kind: 'message', text: message });

    const results: string[] = [];
    for (const a of actions) {
      if (a.tool === 'done') return outcome('succeeded', message || 'Done.');
      await ctx.onStep({ at: now(), kind: 'action', tool: a.tool, ...(a.path ? { path: a.path } : {}), text: a.tool === 'run' ? (a.command ?? '') : a.path ?? a.tool });
      const r = await act(ctx, a);
      results.push(`${a.tool}${a.path ? ` ${a.path}` : ''}${a.command ? ` \`${a.command}\`` : ''}:\n${r}`);
      if (a.tool === 'run' || r.startsWith('Error')) await ctx.onStep({ at: now(), kind: 'result', tool: a.tool, text: clip(r, 2_000) });
      if (ctx.stopped()) return outcome('stopped', 'Stopped before finishing.');
    }
    transcript.push(`You said: ${message || '(nothing)'}\n${results.join('\n\n') || '(no actions)'}`);
    if (!actions.length) transcript.push('You took no actions. Take the next step, or finish with done.');
  }
  return outcome('steps', `Stopped after ${maxSteps} steps without finishing. Ask for the next part, or something smaller.`);
}

// ---- The simulated builder: real file edits, no model, no cost ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * What the simulated model does with a build request: adds a clearly labelled section for it to index.html (or creates
 * the page), so the whole flow (steps, history, preview, restore) can be tried without spending anything.
 */
export async function runSimulatedBuilder(ctx: BuildContext): Promise<BuildOutcome> {
  const say = (text: string) => ctx.onStep({ at: now(), kind: 'message', text });
  const did = (tool: Tool, path: string) => ctx.onStep({ at: now(), kind: 'action', tool, path, text: path });
  await say('Reading the project.');
  await did('list_files', '.');
  const files = new Set((await ctx.workspace.list()).map((f) => f.path));
  // The starter's home page content, or an older project's index.html.
  const target = files.has('content/home.html') ? 'content/home.html' : 'index.html';
  let html = files.has(target) ? await ctx.workspace.read(target) : '';
  if (target === 'index.html' && !html.includes('<main')) throw new HarborError('CONFLICT', 'index.html has no <main> to add to.');
  await did('read_file', target);
  const n = (html.match(/data-request=/g) ?? []).length + 1;
  const section = `\n    <section class="card" data-request="${n}">\n      <h2>${esc(ctx.request.slice(0, 120))}</h2>\n      <p>Simulated build: a real model would build this here. Switch models in Settings → AI model.</p>\n    </section>\n`;
  html = target === 'index.html' ? html.replace('</main>', `${section}  </main>`) : html + section;
  await say(`Adding a section for “${ctx.request.slice(0, 80)}”.`);
  await did('write_file', target);
  await ctx.workspace.write(target, html);
  return { status: 'succeeded', summary: `Added a section for “${ctx.request.slice(0, 80)}” to the page. (Simulated: switch to a real model to build it for real.)`, inputTokens: 0, outputTokens: 0, costCents: 0, model: 'simulated-v1' };
}

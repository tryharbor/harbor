import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
let readKey: { id: string; key: string };
let writeKey: { id: string; key: string };
const send = sender(() => app);
const json = async (method: string, path: string, body?: unknown, status?: number) => {
  const res = await send(method, path, body);
  const out = res.status === 204 ? undefined : await res.json();
  if (status !== undefined) expect(res.status, JSON.stringify(out)).toBe(status);
  return out;
};

const MODE = '(sandbox · simulated model)';
const clients: Client[] = [];

/** A real MCP client whose HTTP goes straight into the Hono app (no network). */
async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL('http://harbor.test/mcp'), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
    fetch: async (url, init) => app.request(String(url), init as RequestInit),
  });
  const client = new Client({ name: 'harbor-test', version: '1.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as ToolResult;
const data = (r: ToolResult) => JSON.parse(r.content[1]!.text);

const rawMcp = (body: unknown, headers: Record<string, string> = {}) =>
  app.request('/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  vi.stubEnv('HARBOR_SECRET_KEY', '');
  vi.stubEnv('HARBOR_API_URL', '');
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  brandId = (await json('POST', '/v1/brands', { name: 'Harbor', memory: RICH_MEMORY }, 201)).id;
  await json('POST', '/v1/sandbox/channels', { brandId, platform: 'x', handle: 'harborhq' }, 201);
});
afterAll(async () => {
  for (const c of clients) await c.close();
  vi.unstubAllEnvs();
  await db.close();
});

describe('API keys', () => {
  it('creates a key once, stores only its hash and never lists the token', async () => {
    const res = await json('POST', '/v1/api-keys', { name: 'Claude Desktop', scopes: ['read'] }, 201);
    readKey = res;
    expect(res).toMatchObject({ id: expect.stringMatching(/^key_/), name: 'Claude Desktop', scopes: ['read'], createdAt: expect.any(String) });
    expect(res.key).toMatch(/^hbr_[0-9A-Za-z]{32}$/);
    expect(res.prefix).toBe(res.key.slice(0, 12));

    const [row] = await db.query<Record<string, unknown>>('SELECT * FROM api_keys WHERE id = $1', [res.id]);
    expect(row!.hash).toBe(createHash('sha256').update(res.key).digest('hex'));
    expect(Object.values(row!).some((v) => v === res.key)).toBe(false);

    writeKey = await json('POST', '/v1/api-keys', { name: 'Agent', scopes: ['read', 'write'] }, 201);
    const { data: keys } = await json('GET', '/v1/api-keys', undefined, 200);
    expect(keys.map((k: any) => k.id)).toEqual([writeKey.id, readKey.id]);
    for (const k of keys) {
      expect(k).not.toHaveProperty('key');
      expect(k).not.toHaveProperty('hash');
      expect(JSON.stringify(k)).not.toContain(k.id === readKey.id ? readKey.key : writeKey.key);
    }
    await json('POST', '/v1/api-keys', { name: 'x', scopes: ['admin'] }, 400);
  });

  it('revokes a key', async () => {
    const temp = await json('POST', '/v1/api-keys', { name: 'Temp', scopes: ['read'] }, 201);
    const revoked = await json('DELETE', `/v1/api-keys/${temp.id}`, undefined, 200);
    expect(revoked).toMatchObject({ id: temp.id, revokedAt: expect.any(String) });
    expect(revoked).not.toHaveProperty('key');
    expect((await rawMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: `Bearer ${temp.key}` })).status).toBe(401);
    await json('DELETE', '/v1/api-keys/key_missing', undefined, 404);
  });
});

describe('/mcp', () => {
  it('needs a valid key', async () => {
    const res = await rawMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
    expect((await res.json()).error.code).toBe('UNAUTHORIZED');
    expect((await rawMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer hbr_notarealkey' })).status).toBe(401);
    // Not behind the web app's CORS rule.
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers raw JSON-RPC and marks the key used', async () => {
    const res = await rawMcp({ jsonrpc: '2.0', id: 7, method: 'tools/list' }, { authorization: `Bearer ${readKey.key}` });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(7);
    expect(body.result.tools.length).toBe(18);
    const { data: keys } = await json('GET', '/v1/api-keys', undefined, 200);
    expect(keys.find((k: any) => k.id === readKey.id).lastUsedAt).toEqual(expect.any(String));
    const get = await app.request('/mcp', { headers: { authorization: `Bearer ${readKey.key}`, accept: 'text/event-stream' } });
    expect(get.status).toBe(405);
  });

  it('lists tools over a real MCP client transport', async () => {
    const client = await connect(readKey.key);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'list_brands', 'get_brand_memory', 'list_posts', 'get_post', 'get_digest', 'best_times', 'list_campaigns', 'list_ideas', 'list_approvals',
        'list_agents', 'get_agent_run', 'create_idea', 'suggest_ideas', 'draft_idea', 'propose_post', 'run_agent', 'add_knowledge', 'add_canvas_note',
      ].sort(),
    );
    const propose = tools.find((t) => t.name === 'propose_post')!;
    expect(propose.inputSchema.required).toEqual(['draftId']);
  });

  it('calls a read tool and states the mode', async () => {
    const client = await connect(readKey.key);
    const r = await call(client, 'list_brands');
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text).toBe(`1 brand ${MODE}`);
    expect(data(r)).toEqual([{ id: brandId, name: 'Harbor', slug: 'harbor', channels: [expect.objectContaining({ platform: 'x', handle: 'harborhq', status: 'connected' })] }]);

    const mem = await call(client, 'get_brand_memory', { brandId });
    expect(data(mem).products[0].name).toBe('Harbor');
    const missing = await call(client, 'get_brand_memory', { brandId: 'brd_missing' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toBe(`Brand brd_missing not found. ${MODE}`);

    const resource = await client.readResource({ uri: `harbor://brands/${brandId}/memory` });
    expect(JSON.parse((resource.contents[0] as { text: string }).text).audiences[0].name).toBe('Indie hackers');
    const { resources } = await client.listResources();
    expect(resources.map((x) => x.uri)).toEqual([`harbor://brands/${brandId}/memory`]);
  });

  it('refuses a write tool for a read-only key, naming the scope', async () => {
    const client = await connect(readKey.key);
    const r = await call(client, 'create_idea', { brandId, title: 'Should not exist' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/create_idea needs the "write" scope\. This API key \(hbr_.{8}…\) only has: read\./);
    expect((await json('GET', `/v1/ideas?brandId=${brandId}`, undefined, 200)).data).toEqual([]);
  });

  it('propose_post creates a pending approval, never a post', async () => {
    const client = await connect(writeKey.key);
    const idea = data(await call(client, 'create_idea', { brandId, title: 'What every social API gives you', notes: 'Use the cost table.' }));
    expect(idea.angle).toBe('Notes: Use the cost table.');
    const drafted = await call(client, 'draft_idea', { ideaId: idea.id, platforms: ['x'] });
    expect(drafted.content[0]!.text).toBe(`Wrote 1 draft for "What every social API gives you" ${MODE}`);
    const { drafts, run } = data(drafted);
    const [stored] = await db.query<{ source: string; api_key_id: string }>('SELECT source, api_key_id FROM agent_runs WHERE id = $1', [run.id]);
    expect(stored).toEqual({ source: 'mcp', api_key_id: writeKey.id });

    const proposed = await call(client, 'propose_post', { draftId: drafts[0].id });
    expect(proposed.isError).toBeFalsy();
    const approval = data(proposed);
    expect(approval).toMatchObject({ status: 'pending', source: 'mcp', draft: { id: drafts[0].id }, channel: { platform: 'x' }, reason: expect.stringMatching(/next free best-time slot/) });
    expect(new Date(approval.proposedFor).getTime()).toBeGreaterThan(Date.now() + 3_600_000);
    expect(approval.checks.length).toBe(6);
    expect((await json('GET', '/v1/approvals?status=pending', undefined, 200)).data.map((a: any) => a.id)).toEqual([approval.id]);
    expect((await json('GET', `/v1/posts?brandId=${brandId}`, undefined, 200)).data).toEqual([]);

    const past = await call(client, 'propose_post', { draftId: drafts[0].id, proposedFor: new Date(Date.now() - 60_000).toISOString() });
    expect(past.isError).toBe(true);
    expect(past.content[0]!.text).toMatch(/must be in the future/);
  });

  it('runs an agent and other write tools', async () => {
    const client = await connect(writeKey.key);
    const r = await call(client, 'run_agent', { agentId: 'weekly_plan', inputs: { brandId, postsPerPlatform: 1 } });
    const run = data(r);
    expect(run).toMatchObject({ agentId: 'weekly_plan', status: 'succeeded', source: 'mcp', approvalCount: 1 });
    expect(r.content[0]!.text).toMatch(new RegExp(`^weekly_plan succeeded: .* \\(sandbox · simulated model\\)$`));
    const [stored] = await db.query<{ api_key_id: string }>('SELECT api_key_id FROM agent_runs WHERE id = $1', [run.id]);
    expect(stored!.api_key_id).toBe(writeKey.id);
    expect(data(await call(client, 'get_agent_run', { runId: run.id })).id).toBe(run.id);

    await call(client, 'add_knowledge', { brandId, title: 'Pricing', body: 'Self-hosting is free.' });
    const brand = await json('GET', `/v1/brands/${brandId}`, undefined, 200);
    expect(brand.memory.knowledge.at(-1)).toMatchObject({ title: 'Pricing', kind: 'note', body: 'Self-hosting is free.' });

    const campaign = await json('POST', '/v1/campaigns', { brandId, name: 'Launch' }, 201);
    const note = data(await call(client, 'add_canvas_note', { campaignId: campaign.id, text: 'From the agent' }));
    expect(note).toMatchObject({ kind: 'note', data: { text: 'From the agent' } });
    expect(data(await call(client, 'list_agents')).map((a: any) => a.id)).toContain('voice_check');
    expect(data(await call(client, 'best_times', { brandId, platform: 'x' })).top).toHaveLength(5);
  });

  it('describes itself at GET /v1/mcp', async () => {
    const info = await json('GET', '/v1/mcp', undefined, 200);
    expect(info).toMatchObject({ url: 'http://localhost:4800/mcp', transport: 'streamable-http' });
    expect(info.tools).toHaveLength(18);
    expect(info.tools.find((t: any) => t.name === 'propose_post')).toMatchObject({ scope: 'write', description: expect.any(String) });
    expect(info.tools.find((t: any) => t.name === 'list_posts').scope).toBe('read');
    expect(info.resources).toContainEqual({ uri: `harbor://brands/${brandId}/memory`, name: 'Harbor: Brand Memory' });
    vi.stubEnv('HARBOR_API_URL', 'https://api.example.com/');
    expect((await json('GET', '/v1/mcp', undefined, 200)).url).toBe('https://api.example.com/mcp');
  });
});

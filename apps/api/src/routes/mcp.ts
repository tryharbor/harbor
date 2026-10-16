import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { DEFAULT_WORKSPACE_ID, HarborError } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { authenticateKey } from '../services/api-keys.ts';
import { MCP_TOOLS, MEMORY_RESOURCE, createMcpServer } from '../services/mcp.ts';

export const apiUrl = () => (process.env.HARBOR_API_URL || 'http://localhost:4800').replace(/\/+$/, '');

/**
 * The MCP server at /mcp: Streamable HTTP in stateless mode (a fresh server and transport per request), behind
 * `Authorization: Bearer hbr_…`. Only POST carries messages; GET (a server-initiated SSE stream) and DELETE
 * (ending a session) have nothing to do without sessions, so they get 405 as the spec allows.
 */
export function registerMcp(app: App, deps: AppDeps) {
  const { db } = deps;

  /** How to connect, for the settings page. */
  app.get('/v1/mcp', async (c) => {
    const brands = await db.query<{ id: string; name: string }>('SELECT id, name FROM brands WHERE workspace_id = $1 ORDER BY created_at, id', [DEFAULT_WORKSPACE_ID]);
    return c.json({
      url: `${apiUrl()}/mcp`,
      transport: 'streamable-http',
      tools: MCP_TOOLS,
      resources: [
        { uri: MEMORY_RESOURCE, name: 'Brand Memory (JSON), per brand' },
        ...brands.map((b) => ({ uri: MEMORY_RESOURCE.replace('{brandId}', b.id), name: `${b.name}: Brand Memory` })),
      ],
    });
  });

  app.all('/mcp', async (c) => {
    const key = await authenticateKey(db, c.req.header('authorization'));
    if (!key) {
      c.header('WWW-Authenticate', 'Bearer realm="harbor"');
      const err = new HarborError('UNAUTHORIZED', 'Send a Harbor API key: Authorization: Bearer hbr_…. Create one in Settings → API keys.');
      return c.json({ error: err.toBody(c.get('requestId')) }, 401);
    }
    if (c.req.method !== 'POST') {
      c.header('Allow', 'POST');
      return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this server is stateless; send requests with POST.' }, id: null }, 405);
    }
    const server = createMcpServer(deps, key);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
    }
  });
}

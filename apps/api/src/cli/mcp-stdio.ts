import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Harbor's MCP server over stdio, for clients that only speak stdio. Relays every JSON-RPC message to the running
 * API's /mcp (Streamable HTTP) with HARBOR_API_KEY, so it works while the API, and its single-process PGlite, is up.
 *
 *   HARBOR_API_URL=http://localhost:4800 HARBOR_API_KEY=hbr_… pnpm --dir apps/api mcp:stdio
 *
 * stdout carries the protocol; anything for people goes to stderr.
 */
const base = (process.env.HARBOR_API_URL || 'http://localhost:4800').replace(/\/+$/, '');
const key = process.env.HARBOR_API_KEY ?? '';
if (!key.startsWith('hbr_')) {
  console.error('Set HARBOR_API_KEY to a Harbor API key (hbr_…). Create one in Settings → API keys.');
  process.exit(1);
}

const upstream = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
const local = new StdioServerTransport();

const isInitializeResult = (m: JSONRPCMessage): m is JSONRPCMessage & { result: { protocolVersion: string } } =>
  'result' in m && typeof (m.result as { protocolVersion?: unknown })?.protocolVersion === 'string';

/** A request the API never answered (it's down, or the key was refused) still gets a JSON-RPC error back. */
const failRequest = (m: JSONRPCMessage, err: unknown) => {
  if (!('id' in m) || !('method' in m)) return;
  void local.send({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: `Harbor API at ${base}/mcp: ${err instanceof Error ? err.message : String(err)}` } });
};

upstream.onmessage = (m) => {
  // Later requests carry the negotiated protocol version, as the SDK's own client does.
  if (isInitializeResult(m)) upstream.setProtocolVersion(m.result.protocolVersion);
  void local.send(m);
};
upstream.onerror = (err) => console.error(`[harbor mcp] ${err.message}`);
local.onmessage = (m) => void upstream.send(m).catch((err) => failRequest(m, err));
local.onclose = () => void upstream.close().finally(() => process.exit(0));

await upstream.start();
await local.start();
console.error(`[harbor mcp] relaying stdio to ${base}/mcp`);

/** A tiny in-memory fetch for provider tests. Routes match on "METHOD host/path" (no query). */

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  /** Parsed: JSON → object, form → object, FormData → FormData, other → raw. */
  body: any;
}

type Reply = Response | (() => Response | Promise<Response>);
type Route = Reply | Reply[];

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function networkError(): () => never {
  return () => {
    throw new TypeError('fetch failed');
  };
}

export function fakeFetch(routes: Record<string, Route>) {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, Reply[]>(Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = (init.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    let body: any = init.body;
    if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    else if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep raw */
      }
    }
    calls.push({ method, url, headers, body });
    const key = `${method} ${url.host}${url.pathname}`;
    const queue = queues.get(key);
    if (!queue || queue.length === 0) throw new Error(`fakeFetch: no route for ${key}`);
    // The last reply repeats, so a single route can serve several calls.
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    const res = typeof reply === 'function' ? await reply() : reply.clone();
    return res;
  }) as typeof fetch;
  return { impl, calls, find: (method: string, hostPath: string) => calls.filter((c) => c.method === method && `${c.url.host}${c.url.pathname}` === hostPath) };
}

export const noSleep = async () => {};

export const app = (platform: string) => ({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: `https://harbor.test/v1/channels/${platform}/callback`,
  sleep: noSleep,
});

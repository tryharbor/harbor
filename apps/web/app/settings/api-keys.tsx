'use client';

import { useActionState, useState } from 'react';
import { createApiKey, type KeyState } from '../agent-actions';

/** Create a key; the full key shows once, filled into the connect snippets. */
export function NewApiKey({ mcpUrl, bridgeDir }: { mcpUrl: string; bridgeDir: string }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(createApiKey, {});
  const key = state.key ?? 'hbr_your_key';
  return (
    <div className="stack">
      <form action={action} className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <label className="field" style={{ width: 260 }}>
          <span className="label">Name</span>
          <input name="name" placeholder="Claude Code on my laptop" required />
        </label>
        <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend className="sr-only">Scopes</legend>
          <label className="channel-pick"><input type="checkbox" name="scopes" value="read" defaultChecked /> Read</label>
          <label className="channel-pick" title="Create ideas, draft, run agents and propose posts. Never publishes: proposals wait in Approvals."><input type="checkbox" name="scopes" value="write" defaultChecked /> Write</label>
        </fieldset>
        <button type="submit" className="primary" disabled={pending}>{pending ? 'Creating…' : 'Create key'}</button>
      </form>
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      {state.key ? (
        <div className="key-reveal" role="status">
          <span className="label">New key · {state.name}</span>
          <div className="row" style={{ gap: 8 }}><code className="key-value">{state.key}</code><Copy text={state.key} /></div>
          <span className="small muted">Copy it now. Harbor only keeps a hash, so it can’t show this again.</span>
        </div>
      ) : null}
      <Snippet title="Claude Code" text={`claude mcp add --transport http harbor ${mcpUrl} \\\n  --header "Authorization: Bearer ${key}"`} />
      <Snippet
        title="Claude Desktop and other stdio clients"
        note="Relays to the running API, so keep the API up while you use it."
        text={JSON.stringify({ mcpServers: { harbor: { command: 'pnpm', args: ['--dir', bridgeDir, 'mcp:stdio'], env: { HARBOR_API_URL: mcpUrl.replace(/\/mcp$/, ''), HARBOR_API_KEY: key } } } }, null, 2)}
      />
    </div>
  );
}

function Snippet({ title, text, note }: { title: string; text: string; note?: string }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="spread"><span className="label">{title}</span><Copy text={text} /></div>
      <pre className="snippet"><code>{text}</code></pre>
      {note ? <span className="small dim">{note}</span> : null}
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="mono-button" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

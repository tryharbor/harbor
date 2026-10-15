export const ID_PREFIX = {
  workspace: 'ws',
  brand: 'brd',
  channel: 'chn',
  competitor: 'cmp',
  idea: 'ida',
  draft: 'drf',
  post: 'pst',
  snapshot: 'snp',
  signal: 'sig',
  insight: 'ins',
  outcome: 'out',
  agentRun: 'run',
  request: 'req',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/** Prefixed random id, e.g. `brd_k3j9…`. The prefix makes ids self-describing in logs and URLs. */
export function newId(kind: IdKind): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
  return `${ID_PREFIX[kind]}_${body}`;
}

/** The workspace a fresh install starts with (single-owner dogfooding). Seeded by the first migration. */
export const DEFAULT_WORKSPACE_ID = 'ws_default';

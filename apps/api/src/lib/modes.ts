import { createHash } from 'node:crypto';

export const PUBLISH_MODES = ['sandbox', 'live'] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

type Env = Record<string, string | undefined>;

/** HARBOR_PUBLISH_MODE: unset or "sandbox" (default) → nothing leaves Harbor; "live" → real platform APIs. */
export function publishModeFromEnv(env: Env = process.env): PublishMode {
  const v = (env.HARBOR_PUBLISH_MODE ?? '').trim().toLowerCase();
  if (!v || v === 'sandbox') return 'sandbox';
  if (v === 'live') return 'live';
  throw new Error(`HARBOR_PUBLISH_MODE must be "sandbox" or "live", got "${env.HARBOR_PUBLISH_MODE}".`);
}

/**
 * Sandbox only: the token key used when HARBOR_SECRET_KEY is unset. It is public (derived from a constant), which
 * is fine because sandbox channels hold fake tokens. Live mode always requires a real HARBOR_SECRET_KEY.
 */
export const SANDBOX_DEV_SECRET_KEY = createHash('sha256').update('harbor-sandbox-dev-key-v1').digest('base64');

let warned = false;
export function sandboxSecretKey(log: (msg: string) => void = console.warn): string {
  if (!warned) {
    warned = true;
    log('HARBOR_SECRET_KEY is unset: using the built-in sandbox dev key (fine for fake sandbox tokens, never for live mode).');
  }
  return SANDBOX_DEV_SECRET_KEY;
}

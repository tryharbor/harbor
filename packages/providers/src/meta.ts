import { BadRequest, PublishOutcomeUnknown, RateLimited, RefreshNeeded, type ProviderError, type StatusCheck, type JsonObject } from '@harbor/core';
import { BaseProvider, asRecord } from './base.ts';

/** Graph API error codes: 190 = invalid/expired token (102 is the legacy session form). */
const TOKEN_CODES = new Set([102, 190]);
/** 4 app limit, 17 user limit, 32 page limit, 613 call-rate limit. */
const RATE_CODES = new Set([4, 17, 32, 613]);

/** Shared pieces of the Instagram (Instagram Login) and Threads adapters: Graph error codes and container states. */
export abstract class MetaGraphProvider extends BaseProvider {
  protected override mapPlatformError(_status: number, body: unknown, message: string): ProviderError | undefined {
    const b = asRecord(body);
    const err = asRecord(b.error);
    const code = Number(err.code ?? b.code);
    const type = err.type ?? b.error_type;
    if (TOKEN_CODES.has(code)) return new RefreshNeeded(this.identifier, message);
    if (RATE_CODES.has(code)) return new RateLimited(this.identifier, message);
    // The OAuth endpoints report bad/expired codes as OAuthException with the HTTP status as `code`.
    if (type === 'OAuthException' && code === 401) return new RefreshNeeded(this.identifier, message);
    return undefined;
  }

  /** Map a container's status string onto StatusCheck. `detail` is the platform's error text, if any. */
  protected containerStatus(containerId: string, status: unknown, detail: unknown, pendingData: JsonObject): StatusCheck {
    const s = String(status ?? '').toUpperCase();
    if (s === 'FINISHED') return { status: 'ready', pendingData };
    if (s === 'IN_PROGRESS' || s === '') return { status: 'pending', pendingData };
    if (s === 'PUBLISHED') {
      throw new PublishOutcomeUnknown(this.identifier, `${this.name} container ${containerId} is already published; check the account and record the post by hand.`);
    }
    const why = typeof detail === 'string' && detail ? `: ${detail}` : '';
    throw new BadRequest(this.identifier, `${this.name} couldn't process the media (${s})${why}`, { containerId, status, detail });
  }

  /** Poll containers until all are FINISHED (used for carousel video children and Threads replies). */
  protected async waitForContainers(ids: string[], check: (id: string) => Promise<StatusCheck>, tries: number, intervalMs = 2000): Promise<void> {
    let remaining = [...ids];
    for (let i = 0; i < tries && remaining.length; i++) {
      if (i > 0) await this.sleep(intervalMs);
      const next: string[] = [];
      for (const id of remaining) if ((await check(id)).status !== 'ready') next.push(id);
      remaining = next;
    }
    if (remaining.length) {
      throw new Error(`${this.name} media is still processing (${remaining.join(', ')}); nothing was published. Try again shortly.`);
    }
  }
}

/** Read insights values: `data[].values[0].value` or `data[].total_value.value`. */
export function readInsights(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const data = asRecord(raw).data;
  if (!Array.isArray(data)) return out;
  for (const entry of data) {
    const e = asRecord(entry);
    const name = typeof e.name === 'string' ? e.name : undefined;
    const v = (Array.isArray(e.values) ? asRecord(e.values[0]).value : undefined) ?? asRecord(e.total_value).value;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (name && Number.isFinite(n)) out[name] = n;
  }
  return out;
}

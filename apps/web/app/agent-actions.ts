'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api, type AgentRunDetail, type ApiKey, type Trigger } from './api';

const go = (path: string, params: Record<string, string> = {}): never => {
  const q = new URLSearchParams(params);
  return redirect(q.size ? `${path}${path.includes('?') ? '&' : '?'}${q}` : path);
};
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const returnTo = (form: FormData, fallback: string) => {
  const r = text(form, 'returnTo');
  return r.startsWith('/') && !r.startsWith('//') ? r : fallback;
};
const refresh = () => revalidatePath('/', 'layout');
/** `datetime-local` values are the viewer's local time; the browser sends its offset in `tz` (minutes, like getTimezoneOffset). */
const localToIso = (value: string, tz: string) => {
  if (!value) return undefined;
  const offset = Number(tz) || 0;
  const [d, t] = value.split('T');
  const [y, m, day] = d!.split('-').map(Number);
  const [h, min] = (t ?? '00:00').split(':').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!, h!, min!) + offset * 60_000).toISOString();
};

// ---- Agents ----

/** Inputs come from the run form: `in.<key>` fields; platforms as repeated `in.platforms`. */
export async function runAgent(form: FormData) {
  const agentId = text(form, 'agentId');
  const inputs: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith('in.') || typeof v !== 'string' || v === '') continue;
    const key = k.slice(3);
    if (key === 'platforms') inputs.platforms = [...((inputs.platforms as string[]) ?? []), v];
    else inputs[key] = /^\d+$/.test(v) && form.get(`num.${key}`) ? Number(v) : v;
  }
  let run: AgentRunDetail | undefined;
  try {
    run = await api<AgentRunDetail>(`/v1/agents/${agentId}/runs`, { method: 'POST', body: JSON.stringify({ inputs }) });
  } catch (err) {
    go(returnTo(form, `/agents/${agentId}`), { error: message(err, 'The agent could not start.') });
  }
  refresh();
  go(`/agents/runs/${run!.id}`);
}

// ---- Approvals ----

export async function approve(form: FormData) {
  const id = text(form, 'approvalId');
  const scheduledFor = localToIso(text(form, 'scheduledFor'), text(form, 'tz'));
  const original = text(form, 'original');
  const edited = text(form, 'text');
  const parts = edited && edited !== original ? edited.split(/^\s*---\s*$/m).map((t) => ({ text: t.trim() })).filter((p) => p.text) : undefined;
  const assetId = text(form, 'mediaAssetId');
  const media = assetId ? [{ assetId, variant: text(form, 'mediaVariant') || undefined }] : undefined;
  try {
    await api(`/v1/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify({ scheduledFor, parts, media }) });
  } catch (err) {
    go(returnTo(form, '/approvals'), { error: message(err, 'Could not approve that post.') });
  }
  refresh();
  go(returnTo(form, '/approvals'), { notice: 'Approved and scheduled. It’s on the calendar.' });
}

export async function reject(form: FormData) {
  const id = text(form, 'approvalId');
  try {
    await api(`/v1/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ note: text(form, 'note') || undefined }) });
  } catch (err) {
    go(returnTo(form, '/approvals'), { error: message(err, 'Could not reject that post.') });
  }
  refresh();
  go(returnTo(form, '/approvals'), { notice: 'Rejected. The agent won’t propose it again.' });
}

export async function bulkApprovals(form: FormData) {
  const ids = form.getAll('ids').map(String).filter(Boolean);
  const action = text(form, 'action') === 'reject' ? 'reject' : 'approve';
  if (!ids.length) go(returnTo(form, '/approvals'), { error: 'Select at least one post first.' });
  let failed = 0;
  try {
    const res = await api<{ results: { id: string; ok: boolean; error?: string }[] }>('/v1/approvals/bulk', { method: 'POST', body: JSON.stringify({ action, ids }) });
    failed = res.results.filter((r) => !r.ok).length;
  } catch (err) {
    go(returnTo(form, '/approvals'), { error: message(err, 'Could not update those posts.') });
  }
  refresh();
  const done = ids.length - failed;
  go(returnTo(form, '/approvals'), {
    [failed ? 'error' : 'notice']: `${action === 'approve' ? 'Approved' : 'Rejected'} ${done} of ${ids.length}.${failed ? ` ${failed} need a look (open each one).` : ''}`,
  });
}

// ---- Automations ----

export async function createAutomation(form: FormData) {
  const type = text(form, 'triggerType');
  const trigger: Trigger =
    type === 'schedule'
      ? { type: 'schedule', weekday: Number(text(form, 'weekday')), hour: Number(text(form, 'hour')) }
      : { type: 'event', event: type as 'post_published' | 'post_outperformed' };
  const inputs: Record<string, unknown> = {};
  const n = text(form, 'postsPerPlatform');
  if (n) inputs.postsPerPlatform = Number(n);
  try {
    await api('/v1/automations', {
      method: 'POST',
      body: JSON.stringify({ brandId: text(form, 'brandId'), agentId: text(form, 'agentId'), name: text(form, 'name') || undefined, trigger, inputs, maxRunsPerDay: Number(text(form, 'maxRunsPerDay')) || undefined }),
    });
  } catch (err) {
    go('/agents/automations', { error: message(err, 'Could not create the automation.') });
  }
  refresh();
  go('/agents/automations', { notice: 'Automation on. Its runs show up under Runs, and anything it drafts waits in Approvals.' });
}

export async function toggleAutomation(form: FormData) {
  const id = text(form, 'automationId');
  try {
    await api(`/v1/automations/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled: text(form, 'enabled') === 'true' }) });
  } catch (err) {
    go('/agents/automations', { error: message(err, 'Could not update the automation.') });
  }
  refresh();
  go('/agents/automations');
}

export async function runAutomationNow(form: FormData) {
  const id = text(form, 'automationId');
  let run: AgentRunDetail | undefined;
  try {
    run = await api<AgentRunDetail>(`/v1/automations/${id}/run`, { method: 'POST' });
  } catch (err) {
    go('/agents/automations', { error: message(err, 'The automation could not run.') });
  }
  refresh();
  go(`/agents/runs/${run!.id}`);
}

export async function deleteAutomation(form: FormData) {
  await api(`/v1/automations/${text(form, 'automationId')}`, { method: 'DELETE' }).catch(() => undefined);
  refresh();
  go('/agents/automations', { notice: 'Automation deleted. Past runs stay in the log.' });
}

// ---- API keys ----

export type KeyState = { key?: string; name?: string; error?: string };

export async function createApiKey(_prev: KeyState, form: FormData): Promise<KeyState> {
  const scopes = form.getAll('scopes').map(String);
  try {
    const res = await api<ApiKey & { key: string }>('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: text(form, 'name'), scopes }) });
    revalidatePath('/settings');
    return { key: res.key, name: res.name };
  } catch (err) {
    return { error: message(err, 'Could not create the key.') };
  }
}

export async function revokeApiKey(form: FormData) {
  await api(`/v1/api-keys/${text(form, 'keyId')}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath('/settings');
  go('/settings', { notice: 'Key revoked. Anything using it loses access right away.' });
}

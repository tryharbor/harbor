'use client';

import { useState } from 'react';
import { createAutomation } from '../../agent-actions';
import type { AgentDef, BrandView } from '../../api';
import { DAYS, TRIGGER, hourLabel } from '../agent-ui';
import { Select } from '../../components/select';

/** Pick an agent, then only the triggers it supports (Sanity Functions style: a schedule or a document event). */
export function NewAutomation({ agents, brands, initialAgent }: { agents: AgentDef[]; brands: BrandView[]; initialAgent?: string }) {
  const automatable = agents.filter((a) => a.triggers.some((t) => t !== 'manual'));
  const [agentId, setAgentId] = useState(automatable.find((a) => a.id === initialAgent)?.id ?? automatable[0]?.id ?? '');
  const agent = automatable.find((a) => a.id === agentId);
  const triggers = (agent?.triggers ?? []).filter((t) => t !== 'manual');
  const [trigger, setTrigger] = useState<string>(triggers[0] ?? 'schedule');
  const active = triggers.includes(trigger as never) ? trigger : triggers[0];
  const takesCount = agent?.inputs.some((i) => i.key === 'postsPerPlatform');

  if (!automatable.length || !brands.length) return <p className="small muted">Add a brand first; automations run for one brand.</p>;
  return (
    <form action={createAutomation} className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        <label className="field">
          <span className="label">Agent</span>
          <Select name="agentId" value={agentId} onChange={setAgentId} ariaLabel="Agent" options={automatable.map((a) => ({ value: a.id, label: a.name, hint: a.tagline }))} />
        </label>
        <label className="field">
          <span className="label">Brand</span>
          <Select name="brandId" ariaLabel="Brand" options={brands.map((b) => ({ value: b.id, label: b.name }))} />
        </label>
        <label className="field">
          <span className="label">Name · optional</span>
          <input name="name" placeholder={agent ? `${agent.name} · auto` : ''} />
        </label>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 8 }}>Runs</legend>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {triggers.map((t) => (
            <label key={t} className="channel-pick">
              <input type="radio" name="triggerType" value={t} checked={active === t} onChange={() => setTrigger(t)} />
              {TRIGGER[t]}
            </label>
          ))}
        </div>
      </fieldset>
      {active === 'schedule' ? (
        <div className="row" style={{ gap: 12, maxWidth: 420 }}>
          <label className="field"><span className="label">Every</span>
            <Select name="weekday" defaultValue="1" ariaLabel="Day" options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
          </label>
          <label className="field"><span className="label">At</span>
            <Select name="hour" defaultValue="8" ariaLabel="Hour" options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))} />
          </label>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {active === 'post_outperformed'
            ? 'Fires once per post, the first time it beats 1.3× the brand’s median for its platform at the same age.'
            : 'Fires once per post, when the platform confirms it went out.'}
        </p>
      )}
      <div className="row" style={{ gap: 12, maxWidth: 420 }}>
        {takesCount ? (
          <label className="field"><span className="label">Posts per platform</span><input type="number" name="postsPerPlatform" min={1} max={7} defaultValue={3} /></label>
        ) : null}
        <label className="field"><span className="label">At most, runs a day</span><input type="number" name="maxRunsPerDay" min={1} max={24} defaultValue={3} /></label>
      </div>
      <p className="small dim" style={{ margin: 0 }}>The daily cap keeps model spend predictable once Harbor runs on a real model. After 3 failures in a row an automation pauses itself.</p>
      <div><button type="submit" className="primary">Turn on automation</button></div>
    </form>
  );
}

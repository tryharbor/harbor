import { removeModelKey, saveModelKey, setActiveModel } from '../actions';
import type { ModelChoice } from '../api';
import { Select } from './select';
import { SubmitButton } from './submit-button';

const KEY_PILL = { own: { text: 'Your key', cls: 's-connected' }, harbor: { text: "Harbor's key", cls: 'plain' }, none: { text: 'No key yet', cls: 's-unknown' } } as const;
const per = (n: number) => `$${n < 1 ? n.toFixed(2) : n}`;

/**
 * The workspace's AI model: one card per provider (Anthropic, OpenAI, Google) with whose key it would use, the
 * owner's own key, and the models to choose from. Switching applies to every AI feature on the next call.
 */
export function ModelSettings({ choice }: { choice: ModelChoice }) {
  const { active } = choice;
  const activeLabel = choice.providers.flatMap((p) => p.models).find((m) => m.id === active.model)?.label ?? active.model;
  return (
    <section className="stack" id="ai">
      <div className="spread">
        <div className="stack" style={{ gap: 4 }}>
          <h2 style={{ margin: 0 }}>AI model</h2>
          <p className="small muted" style={{ maxWidth: '70ch' }}>
            Pick the model Harbor writes and builds with. Use Harbor’s key, billed through your plan, or add your own key to use your provider account. Keys are stored encrypted and never shown again.
          </p>
        </div>
        <span className="pill s-connected">Now: {active.provider === 'simulated' ? 'Simulated (no cost)' : activeLabel}</span>
      </div>
      {!choice.switchable ? <p className="notice small">This server’s model is fixed for testing and can’t be switched here.</p> : null}
      <div className="model-grid">
        {choice.providers.map((p) => {
          const isActive = active.provider === p.id;
          const pill = KEY_PILL[p.key];
          return (
            <div key={p.id} className={`model-card${isActive ? ' active' : ''}`}>
              <div className="spread">
                <strong style={{ fontWeight: 600 }}>{p.name}</strong>
                <span className={`pill ${pill.cls}`}>{pill.text}</span>
              </div>
              <ul className="model-list">
                {p.models.map((m) => (
                  <li key={m.id}>
                    <span className="stack" style={{ gap: 0 }}>
                      <span>{m.label}{isActive && active.model === m.id ? <span className="small dim"> · in use</span> : null}</span>
                      <span className="small dim">{m.note}{m.price ? ` · ${per(m.price.input)} / ${per(m.price.output)} per 1M tokens` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <form action={setActiveModel} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="provider" value={p.id} />
                <Select name="model" ariaLabel={`${p.name} model`} defaultValue={isActive ? active.model : p.models[0]?.id} options={p.models.map((m) => ({ value: m.id, label: m.label }))} width={180} />
                <SubmitButton className={isActive ? undefined : 'primary'} pending="Switching…">{isActive ? 'Update' : 'Use'}</SubmitButton>
              </form>
              <details>
                <summary className="small muted">{p.key === 'own' ? 'Replace or remove your key' : `Use your own ${p.name} key`}</summary>
                <form action={saveModelKey} className="row" style={{ gap: 6, marginTop: 8 }}>
                  <input type="hidden" name="provider" value={p.id} />
                  <input name="key" type="password" autoComplete="off" required minLength={20} placeholder="Paste API key" aria-label={`${p.name} API key`} style={{ flex: 1, minWidth: 0 }} />
                  <SubmitButton pending="Saving…">Save</SubmitButton>
                </form>
                {p.key === 'own' ? (
                  <form action={removeModelKey} style={{ marginTop: 6 }}>
                    <input type="hidden" name="provider" value={p.id} />
                    <button type="submit" className="link-button small">Remove my key</button>
                  </form>
                ) : null}
              </details>
            </div>
          );
        })}
      </div>
      {active.provider !== 'simulated' ? (
        <form action={setActiveModel}>
          <input type="hidden" name="provider" value="simulated" />
          <button type="submit" className="link-button small">Switch back to the simulated model (no cost)</button>
        </form>
      ) : null}
    </section>
  );
}

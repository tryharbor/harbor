import type { ReactNode } from 'react';
import { createCompetitor, deleteCompetitor, deleteListItem, saveListItem, saveStyleRules, saveVoice } from '../actions';
import type { Audience, BrandView, Competitor, ExamplePost, KnowledgeItem, MemoryListKey, Product } from '../api';
import { PLATFORM_NAME, SimTag } from '../ui';
import { VoiceLearner } from './voice-learner';
import { Select } from './select';

/** Brand Memory, section by section. Each section saves on its own (the API merges memory by top-level key). */

const join = (xs: string[] = []) => xs.join('\n');
const Hidden = ({ brandId, returnTo, list, id }: { brandId: string; returnTo: string; list?: MemoryListKey; id?: string }) => (
  <>
    <input type="hidden" name="brandId" value={brandId} />
    <input type="hidden" name="returnTo" value={returnTo} />
    {list ? <input type="hidden" name="list" value={list} /> : null}
    {id ? <input type="hidden" name="id" value={id} /> : null}
  </>
);

function SectionIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p className="muted small" style={{ maxWidth: '68ch' }}>{children}</p>
    </div>
  );
}

// ---- Voice ----

export function VoiceSection({ brand, returnTo }: { brand: BrandView; returnTo: string }) {
  const v = brand.memory.voice;
  const savedChars = brand.memory.examplePosts.reduce((n, e) => n + e.text.length, 0);
  return (
    <div className="stack-lg">
      <SectionIntro title="Voice">
        How {brand.name} sounds, specific enough that someone new could write like it. Learn it from real posts, then edit anything.
      </SectionIntro>
      <VoiceLearner brandId={brand.id} returnTo={returnTo} savedExampleChars={savedChars} />
      <form action={saveVoice} className="stack card">
        <Hidden brandId={brand.id} returnTo={returnTo} />
        <div className="spread">
          <span className="label">Current voice</span>
          {v.learnedBy ? <span className="row small dim">Learned {v.learnedAt ? new Date(v.learnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} <SimTag model={v.learnedBy} /></span> : null}
        </div>
        <div className="field">
          <label htmlFor="summary">Personality and style</label>
          <textarea id="summary" name="summary" defaultValue={v.summary} placeholder="Candid, builder-to-builder. Short declarative sentences, specifics over adjectives…" />
        </div>
        <div className="field">
          <label htmlFor="values">Values, one per line as <code>Name: what it means in the writing</code></label>
          <textarea id="values" name="values" defaultValue={v.values.map((x) => (x.meaning ? `${x.name}: ${x.meaning}` : x.name)).join('\n')} style={{ minHeight: 110 }} placeholder={'Transparency: costs and failures named alongside wins'} />
        </div>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label htmlFor="do">Do (one rule per line)</label>
            <textarea id="do" name="do" defaultValue={join(v.do)} style={{ minHeight: 130 }} />
          </div>
          <div className="field">
            <label htmlFor="avoid">Avoid (one per line)</label>
            <textarea id="avoid" name="avoid" defaultValue={join(v.avoid)} style={{ minHeight: 130 }} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="bannedWords">Banned words (comma-separated)</label>
          <input id="bannedWords" name="bannedWords" defaultValue={v.bannedWords.join(', ')} placeholder="leverage, seamless, unlock, game-changing" />
        </div>
        <div className="field">
          <label htmlFor="excerpts">Excerpts: short, verbatim lines that sound exactly right. Separate with <code>---</code>.</label>
          <textarea id="excerpts" name="excerpts" defaultValue={v.excerpts.map((e) => e.text).join('\n---\n')} style={{ minHeight: 120 }} />
        </div>
        {v.sources.length ? <div className="chips"><span className="label">Sources</span>{v.sources.map((s, i) => <span key={i} className="chip">{s.label}</span>)}</div> : null}
        <div><button className="inverse" type="submit">Save voice</button></div>
      </form>
    </div>
  );
}

// ---- Repeatable lists ----

const LIST_COPY: Record<MemoryListKey, { title: string; intro: (b: string) => string; add: string; empty: string }> = {
  audiences: { title: 'Audiences', intro: (b) => `Who ${b} talks to. Ideas and drafts target one audience at a time.`, add: 'Add an audience', empty: 'No audiences yet.' },
  products: { title: 'Products and offers', intro: (b) => `What ${b} sells or points people to, with the proof that backs it up.`, add: 'Add a product', empty: 'No products yet.' },
  knowledge: { title: 'Knowledge', intro: (b) => `Facts Harbor should know about ${b}: notes, docs and links. Drafts can only state facts from here.`, add: 'Add a note or link', empty: 'Nothing saved yet.' },
  examplePosts: { title: 'Example posts', intro: (b) => `Real posts that sound like ${b}. Harbor learns the voice from these.`, add: 'Add an example post', empty: 'No examples yet.' },
};

export function ListSection({ brand, list, returnTo }: { brand: BrandView; list: MemoryListKey; returnTo: string }) {
  const copy = LIST_COPY[list];
  const items = (brand.memory[list] ?? []) as { id: string }[];
  return (
    <div className="stack-lg">
      <SectionIntro title={copy.title}>{copy.intro(brand.name)}</SectionIntro>
      {items.length === 0 ? <div className="empty"><span className="muted">{copy.empty}</span></div> : null}
      {items.map((item) => (
        <details key={item.id} className="card">
          <summary className="spread">
            <ItemSummary list={list} item={item} />
            <span className="dim small">Edit</span>
          </summary>
          <div className="stack" style={{ marginTop: 14 }}>
            <form action={saveListItem} className="stack">
              <Hidden brandId={brand.id} returnTo={returnTo} list={list} id={item.id} />
              <ItemFields list={list} item={item} />
              <div><button className="inverse" type="submit">Save</button></div>
            </form>
            <form action={deleteListItem}>
              <Hidden brandId={brand.id} returnTo={returnTo} list={list} id={item.id} />
              <button className="link-button small" type="submit">Remove</button>
            </form>
          </div>
        </details>
      ))}
      <details className="card staging" open={items.length === 0}>
        <summary className="row"><span className="button mono-button">+ {copy.add}</span></summary>
        <form action={saveListItem} className="stack" style={{ marginTop: 14 }}>
          <Hidden brandId={brand.id} returnTo={returnTo} list={list} />
          <ItemFields list={list} />
          <div><button className="primary" type="submit">{copy.add}</button></div>
        </form>
      </details>
    </div>
  );
}

function ItemSummary({ list, item }: { list: MemoryListKey; item: { id: string } }) {
  switch (list) {
    case 'audiences': {
      const a = item as Audience;
      return <span className="stack" style={{ gap: 2 }}><strong style={{ fontWeight: 500 }}>{a.name}</strong><span className="muted small">{a.description || `${a.painPoints.length} pain points`}</span></span>;
    }
    case 'products': {
      const p = item as Product;
      return <span className="stack" style={{ gap: 2 }}><strong style={{ fontWeight: 500 }}>{p.name}</strong><span className="muted small">{p.summary}</span></span>;
    }
    case 'knowledge': {
      const k = item as KnowledgeItem;
      return <span className="stack" style={{ gap: 2 }}><span className="row"><span className="tag">{k.kind}</span><strong style={{ fontWeight: 500 }}>{k.title}</strong></span>{k.url ? <span className="dim small">{k.url}</span> : null}</span>;
    }
    case 'examplePosts': {
      const e = item as ExamplePost;
      return <span className="stack" style={{ gap: 4 }}>{e.platform ? <span className="ptag">{PLATFORM_NAME[e.platform]}</span> : null}<span className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.text.slice(0, 220)}{e.text.length > 220 ? '…' : ''}</span></span>;
    }
  }
}

function ItemFields({ list, item }: { list: MemoryListKey; item?: { id: string } }) {
  switch (list) {
    case 'audiences': {
      const a = item as Audience | undefined;
      return (
        <>
          <div className="field"><label>Name</label><input name="name" required defaultValue={a?.name} placeholder="Serial builders" /></div>
          <div className="field"><label>Who they are</label><textarea name="description" defaultValue={a?.description} style={{ minHeight: 80 }} /></div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Pain points (one per line)</label><textarea name="painPoints" defaultValue={join(a?.painPoints)} style={{ minHeight: 100 }} /></div>
            <div className="field"><label>Goals (one per line)</label><textarea name="goals" defaultValue={join(a?.goals)} style={{ minHeight: 100 }} /></div>
          </div>
        </>
      );
    }
    case 'products': {
      const p = item as Product | undefined;
      return (
        <>
          <div className="field"><label>Name</label><input name="name" required defaultValue={p?.name} /></div>
          <div className="field"><label>What it is, in a sentence</label><input name="summary" defaultValue={p?.summary} /></div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Call to action</label><input name="cta" defaultValue={p?.cta} placeholder="Join the waitlist" /></div>
            <div className="field"><label>Link</label><input name="url" type="url" defaultValue={p?.url} placeholder="https://…" /></div>
          </div>
          <div className="field"><label>Proof points (one per line: numbers, customers, results)</label><textarea name="proofPoints" defaultValue={join(p?.proofPoints)} style={{ minHeight: 90 }} /></div>
        </>
      );
    }
    case 'knowledge': {
      const k = item as KnowledgeItem | undefined;
      return (
        <>
          <div className="field"><label>Title</label><input name="title" required defaultValue={k?.title} /></div>
          <div className="field"><label>Link (optional)</label><input name="url" type="url" defaultValue={k?.url} placeholder="https://…" /></div>
          <div className="field"><label>Notes</label><textarea name="body" defaultValue={k?.body} style={{ minHeight: 110 }} /></div>
        </>
      );
    }
    case 'examplePosts': {
      const e = item as ExamplePost | undefined;
      return (
        <>
          <div className="field"><label>Post</label><textarea name="text" required defaultValue={e?.text} /></div>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label>Platform</label>
              <Select name="platform" defaultValue={e?.platform ?? ''} ariaLabel="Platform" options={[{ value: '', label: 'Any' }, ...Object.entries(PLATFORM_NAME).map(([k, v]) => ({ value: k, label: v }))]} />
            </div>
            <div className="field"><label>Link to the original (optional)</label><input name="url" type="url" defaultValue={e?.url} /></div>
          </div>
          <div className="field"><label>Why it's a good example (optional)</label><input name="note" defaultValue={e?.note} /></div>
        </>
      );
    }
  }
}

// ---- Competitors ----

export function CompetitorsSection({ brandId, brandName, competitors, returnTo }: { brandId: string; brandName: string; competitors: Competitor[]; returnTo: string }) {
  return (
    <div className="stack-lg">
      <SectionIntro title="Competitors">Accounts to watch for {brandName}. Their public posts become signals Harbor can cite in ideas.</SectionIntro>
      {competitors.length === 0 ? <div className="empty"><span className="muted">No competitors yet.</span></div> : (
        <section>
          <ul className="list">
            {competitors.map((c) => (
              <li key={c.id}>
                <div className="spread">
                  <strong style={{ fontWeight: 500 }}>{c.name}</strong>
                  <form action={deleteCompetitor}>
                    <input type="hidden" name="brandId" value={brandId} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="returnTo" value={returnTo} />
                    <button className="link-button small" type="submit">Remove</button>
                  </form>
                </div>
                <div className="row small">
                  {c.handles.map((h) => <span key={`${h.platform}${h.handle}`} className="ptag">{PLATFORM_NAME[h.platform]} <span className="muted">@{h.handle}</span></span>)}
                  {c.url ? <a className="dim" href={c.url} target="_blank" rel="noreferrer">{c.url}</a> : null}
                </div>
                {c.notes ? <span className="muted small">{c.notes}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
      <details className="card staging" open={competitors.length === 0}>
        <summary><span className="button mono-button">+ Add a competitor</span></summary>
        <form action={createCompetitor} className="stack" style={{ marginTop: 14 }}>
          <input type="hidden" name="brandId" value={brandId} /><input type="hidden" name="returnTo" value={returnTo} />
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field"><label>Name</label><input name="name" required /></div>
            <div className="field"><label>Website</label><input name="url" type="url" placeholder="https://…" /></div>
          </div>
          <div className="field"><label>Accounts, one per line as <code>platform: handle</code></label><textarea name="handles" style={{ minHeight: 80 }} placeholder={'x: postizapp\nlinkedin: postiz'} /></div>
          <div className="field"><label>What to watch for</label><input name="notes" placeholder="Launch cadence, hooks that work for them…" /></div>
          <div><button className="primary" type="submit">Add competitor</button></div>
        </form>
      </details>
    </div>
  );
}

// ---- Style rules ----

export function StyleSection({ brand, returnTo }: { brand: BrandView; returnTo: string }) {
  const s = brand.memory.styleRules;
  return (
    <div className="stack-lg">
      <SectionIntro title="Style rules">Hard rules every draft follows: the words {brand.name} uses, and formatting habits.</SectionIntro>
      <form action={saveStyleRules} className="card stack">
        <Hidden brandId={brand.id} returnTo={returnTo} />
        <div className="field">
          <label htmlFor="terms">Terms, one per line as <code>use =&gt; instead of</code></label>
          <textarea id="terms" name="terms" defaultValue={s.terms.map((t) => `${t.use} => ${t.insteadOf}`).join('\n')} style={{ minHeight: 110 }} placeholder={'open source => open-source\nbuilders => founders'} />
        </div>
        <div className="field">
          <label htmlFor="formatting">Formatting rules (one per line)</label>
          <textarea id="formatting" name="formatting" defaultValue={join(s.formatting)} style={{ minHeight: 110 }} placeholder={'No emoji in LinkedIn posts\nAt most one hashtag on X'} />
        </div>
        <div><button className="inverse" type="submit">Save style rules</button></div>
      </form>
    </div>
  );
}

// ---- Preview card (Jasper's live preview, Sanity's document preview) ----

export function MemoryPreview({ brand, competitors, title = 'What Harbor knows', focus }: { brand: BrandView; competitors?: Competitor[]; title?: string; focus?: string }) {
  const m = brand.memory;
  const exampleChars = m.examplePosts.reduce((n, e) => n + e.text.length, 0);
  // Same order as setting a brand up: what it is, who it's for, how it sounds, then the extras.
  const checks = [
    { key: 'products', label: 'Products', ok: m.products.length > 0, detail: m.products.map((p) => p.name).join(', ') || 'None yet' },
    { key: 'audiences', label: 'Audiences', ok: m.audiences.length > 0, detail: m.audiences.map((a) => a.name).join(', ') || 'None yet' },
    { key: 'voice', label: 'Voice', ok: !!m.voice.summary, detail: m.voice.summary ? `${m.voice.values.length} values · ${m.voice.do.length} do · ${m.voice.avoid.length} avoid` : 'Not learned yet' },
    { key: 'examples', label: 'Example posts', ok: m.examplePosts.length > 0, detail: m.examplePosts.length ? `${m.examplePosts.length} post${m.examplePosts.length === 1 ? '' : 's'} · ${exampleChars.toLocaleString('en-US')} chars` : 'None yet · optional' },
    { key: 'knowledge', label: 'Knowledge', ok: m.knowledge.length > 0, detail: m.knowledge.length ? `${m.knowledge.length} item${m.knowledge.length === 1 ? '' : 's'}` : 'None yet · optional' },
    { key: 'competitors', label: 'Competitors', ok: (competitors?.length ?? 0) > 0, detail: competitors?.map((c) => c.name).join(', ') || 'None yet · optional' },
  ];
  const score = checks.filter((c) => c.ok).length;
  return (
    <aside className="preview-card">
      <div className="spread">
        <span className="label">{title}</span>
        <span className="mono small dim">{score}/{checks.length}</span>
      </div>
      <strong style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em' }}>{brand.name}</strong>
      {m.voice.summary ? <p className="muted small">{m.voice.summary.slice(0, 220)}{m.voice.summary.length > 220 ? '…' : ''}</p> : null}
      {m.voice.excerpts[0] ? <p className="excerpt small">{m.voice.excerpts[0].text}</p> : null}
      <ul className="list small">
        {checks.map((c) => (
          <li key={c.label} className={focus === c.key ? 'focus' : undefined} style={{ gridTemplateColumns: '18px 1fr', columnGap: 8 }}>
            <span aria-hidden="true" style={{ color: c.ok ? 'var(--good)' : 'var(--dim)', gridRow: 'span 2' }}>{c.ok ? '●' : '○'}</span>
            <span>{c.label}</span>
            <span className="dim">{c.detail}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

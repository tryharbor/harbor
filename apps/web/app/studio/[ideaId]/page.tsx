import Link from 'next/link';
import type { Channel, Platform } from '@harbor/core';
import { generateDrafts, moveIdea } from '../../actions';
import { API_BROWSER_URL, getBrand, getChannels, getDrafts, getIdeas, getPosts, getSignals, loadAll, type BrandView, type DraftView, type IdeaView, type PostView, type SignalView } from '../../api';
import { DraftEditor } from '../../components/draft-editor';
import { Flash, LoadError, PageHeader, PLATFORM_NAME } from '../../ui';
import { PlatformIcon } from '../../platform-icon';

export const dynamic = 'force-dynamic';

const PLATFORMS: Platform[] = ['x', 'linkedin', 'threads', 'instagram'];

export default async function StudioIdea({ params, searchParams }: { params: Promise<{ ideaId: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { ideaId } = await params;
  const flash = await searchParams;
  const ideasRes = await loadAll<[IdeaView[]]>([getIdeas()]);
  if (!ideasRes.ok) return <LoadError message={ideasRes.error} />;
  const idea = ideasRes.data[0].find((i) => i.id === ideaId);
  if (!idea) return (<><Link href="/studio">← Studio</Link><LoadError message="That idea doesn't exist anymore." /></>);

  const res = await loadAll<[BrandView, Channel[], DraftView[], SignalView[], PostView[]]>([
    getBrand(idea.brandId), getChannels(idea.brandId), getDrafts({ ideaId, all: '1' }), getSignals(idea.brandId), getPosts({ brandId: idea.brandId, limit: '200' }),
  ]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, channels, allDrafts, signals, brandPosts] = res.data;
  const postsFor = (p: Platform) => brandPosts.filter((x) => x.ideaId === ideaId && x.channel.platform === p).map((x) => ({ id: x.id, status: x.status, url: x.url, publishedAt: x.publishedAt, scheduledFor: x.scheduledFor }));
  const connected = channels.filter((c) => c.status === 'connected');
  const latest = (p: Platform) => allDrafts.filter((d) => d.platform === p).sort((a, b) => b.version - a.version);
  const drafted = PLATFORMS.filter((p) => latest(p).length > 0);
  const defaults = new Set(drafted.length ? drafted : connected.map((c) => c.platform));
  const cited = idea.basis.map((b) => ({ ...b, signal: signals.find((s) => s.id === b.signalId) }));
  const back = `/studio/${ideaId}`;
  const m = brand.memory;

  return (
    <>
      <Link href="/studio" className="dim small">← Studio</Link>
      <PageHeader
        eyebrow={`${brand.name} · ${idea.status}`}
        title={idea.title}
        sub={idea.angle || undefined}
        actions={
          idea.status === 'drafting' || idea.status === 'idea' ? (
            <form action={moveIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="status" value={idea.status === 'idea' ? 'drafting' : 'approved'} />
              <input type="hidden" name="returnTo" value={back} />
              <button className="inverse" type="submit">{idea.status === 'idea' ? 'Start drafting' : 'Approve idea'}</button>
            </form>
          ) : <span className={`pill s-${idea.status}`}>{idea.status}</span>
        }
      />
      {cited.length ? (
        <div className="row">
          <span className="label">Why this idea</span>
          {cited.map((c) => <span key={c.signalId} className="cite">{c.note || c.signal?.summary || 'signal'}</span>)}
        </div>
      ) : null}
      <Flash params={flash} />

      <form action={generateDrafts} className="agent-panel">
        <div className="spread">
          <div className="stack" style={{ gap: 4 }}>
            <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Agent · Draft for each platform</span>
            <strong style={{ fontWeight: 500 }}>{drafted.length ? 'Draft again (adds a new version per platform)' : 'Draft this idea in the brand’s voice'}</strong>
          </div>
          <span className="tag">Simulated · no spend</span>
        </div>
        <input type="hidden" name="ideaId" value={ideaId} />
        <input type="hidden" name="returnTo" value={back} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Context Harbor uses</span>
          <div className="chips">
            <span className={`chip${m.voice.summary ? ' on' : ''}`}>Voice{m.voice.excerpts.length ? ` · ${m.voice.excerpts.length} excerpts` : ''}</span>
            {m.audiences.map((a) => <span key={a.id} className="chip on">Audience · {a.name}</span>)}
            {m.products.map((p) => <span key={p.id} className="chip on">Product · {p.name}</span>)}
            {m.styleRules.terms.length + m.styleRules.formatting.length ? <span className="chip on">Style rules</span> : null}
            {cited.length ? <span className="chip on">{cited.length} cited signal{cited.length > 1 ? 's' : ''}</span> : null}
            {!m.voice.summary ? <Link className="chip" href={`/brands/${brand.id}/memory`}>+ Describe the voice first</Link> : null}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Platforms</span>
          <div className="row">
            {PLATFORMS.map((p) => (
              <label key={p} className="channel-pick">
                <input type="checkbox" name="platform" value={p} defaultChecked={defaults.has(p)} />
                <PlatformIcon platform={p} size={13} />{PLATFORM_NAME[p]}
                {connected.some((c) => c.platform === p) ? null : <span className="dim small">(not connected)</span>}
              </label>
            ))}
          </div>
        </div>
        <div><button className="primary" type="submit">{drafted.length ? 'Draft again' : 'Draft it'}</button></div>
      </form>

      {drafted.length === 0 ? (
        <div className="empty"><span className="label">Panes</span><span className="muted">Each platform gets its own pane here: editor, live preview, rewrites, versions and scheduling.</span></div>
      ) : (
        <div className="panes">
          {drafted.map((p) => {
            const versions = latest(p);
            return (
              <DraftEditor
                key={`${p}-${versions[0]!.id}`}
                brandId={brand.id}
                brandName={brand.name}
                ideaId={ideaId}
                platform={p}
                draft={versions[0]}
                versions={[...versions].reverse()}
                channels={connected.filter((c) => c.platform === p).map((c) => ({ id: c.id, handle: c.account.handle, displayName: c.account.displayName, avatarUrl: c.account.avatarUrl }))}
                logoUrl={brand.logoUrl}
                posted={postsFor(p)}
                apiUrl={API_BROWSER_URL}
              />
            );
          })}
        </div>
      )}
    </>
  );
}

import Link from 'next/link';
import type { Channel, Platform } from '@harbor/core';
import { getBrand, getCanvas, getChannels, getIdeas, getPosts, getSignals, loadAll, type BrandView, type CanvasData, type CanvasItem, type IdeaView, type PostView, type SignalView } from '../../api';
import { CanvasBoard } from '../../components/canvas/canvas-board';
import { LoadError, PageHeader, StatusPill } from '../../ui';

export const dynamic = 'force-dynamic';

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view } = await searchParams;
  const canvasRes = await loadAll<[CanvasData]>([getCanvas(id)]);
  if (!canvasRes.ok) return (<><Link href="/campaigns" className="dim small">← Campaigns</Link><LoadError message={canvasRes.error} /></>);
  const [{ campaign, items, edges }] = canvasRes.data;
  const res = await loadAll<[BrandView, Channel[], IdeaView[], PostView[], SignalView[]]>([
    getBrand(campaign.brandId), getChannels(campaign.brandId), getIdeas({ brandId: campaign.brandId }), getPosts({ brandId: campaign.brandId, limit: '100' }), getSignals(campaign.brandId),
  ]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, channels, ideas, posts, signals] = res.data;
  const table = view === 'table';

  return (
    <>
      <PageHeader
        eyebrow={<><Link href="/campaigns" className="dim">Campaigns</Link> · {campaign.brandName}</>}
        title={campaign.name}
        sub={campaign.goal || undefined}
        actions={
          <span className="row small">
            <span className={`pill ${campaign.status === 'active' ? 's-scheduled' : 'plain'}`}>{campaign.status}</span>
            {campaign.startsOn ? <span className="mono dim">{fmt(campaign.startsOn)}{campaign.endsOn ? ` – ${fmt(campaign.endsOn)}` : ''}</span> : null}
            {table ? <span className="segmented"><Link href={`/campaigns/${id}`}>Board</Link><Link href={`/campaigns/${id}?view=table`} aria-current="page">Table</Link></span> : null}
          </span>
        }
      />
      {table ? (
        <CanvasTable items={items} />
      ) : (
        <CanvasBoard
          campaignId={id}
          items={items}
          edges={edges}
          tableHref={`/campaigns/${id}?view=table`}
          brand={{
            voice: !!brand.memory.voice.summary,
            audiences: brand.memory.audiences.map((a) => a.name),
            products: brand.memory.products.map((p) => p.name),
            connectedPlatforms: [...new Set(channels.filter((c) => c.status === 'connected').map((c) => c.platform as Platform))],
          }}
          library={{ ideas, posts, signals }}
        />
      )}
    </>
  );
}

/** The same cards as rows (Jasper's Table mode): what's in the campaign and where it sits. */
function CanvasTable({ items }: { items: CanvasItem[] }) {
  const frames = new Map(items.filter((i) => i.kind === 'frame').map((f) => [f.id, f.data.title ?? 'Frame']));
  const rows = items.filter((i) => i.kind !== 'frame');
  const title = (i: CanvasItem): string => {
    const e = i.entity as Record<string, unknown> | undefined;
    if (i.kind === 'note') return i.data.text || 'Empty note';
    if (!e) return 'Deleted';
    if (i.kind === 'idea') return String(e.title);
    if (i.kind === 'signal') return String(e.summary);
    const parts = e.parts as { text: string }[] | undefined;
    return parts?.[0]?.text ?? '';
  };
  const link = (i: CanvasItem): string | undefined => {
    const e = i.entity as Record<string, unknown> | undefined;
    if (!e) return undefined;
    if (i.kind === 'idea') return `/studio/${String(e.id)}`;
    if (i.kind === 'draft' && e.ideaId) return `/studio/${String(e.ideaId)}`;
    if (i.kind === 'post') return `/performance/${String(e.id)}`;
    return undefined;
  };
  const status = (i: CanvasItem) => {
    const e = i.entity as Record<string, unknown> | undefined;
    if (i.kind === 'post' && e) return <StatusPill status={e.status as PostView['status']} />;
    if (i.kind === 'idea' && e) return <span className={`pill s-${String(e.status)}`}>{String(e.status)}</span>;
    if (i.kind === 'draft' && e) return <span className="mono small dim">{String(e.platform)} · v{String(e.version)}</span>;
    return <span className="dim">–</span>;
  };
  if (rows.length === 0) return <div className="empty"><span className="muted">No cards yet. Switch to the board and add some.</span></div>;
  return (
    <section className="scroll">
      <table>
        <thead><tr><th>Kind</th><th>Card</th><th>Frame</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((i) => {
            const href = link(i);
            const t = title(i).slice(0, 140);
            return (
              <tr key={i.id}>
                <td><span className="tag">{i.kind}</span></td>
                <td style={{ maxWidth: 520 }}>{href ? <Link href={href}>{t}</Link> : t}</td>
                <td className="small muted">{i.parentId ? frames.get(i.parentId) : 'Free'}</td>
                <td>{status(i)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

import type { Channel, Platform } from '@harbor/core';
import { getBrand, getChannels, getIdeas, loadAll, type BrandView, type IdeaView } from '../../../api';
import { LoadError } from '../../../ui';
import { PreviewForm } from './preview-form';

export const dynamic = 'force-dynamic';

const ALL: Platform[] = ['x', 'linkedin', 'instagram', 'threads'];

/** Jasper's "Preview Brand Voice", with the receipts: which rules fired and what each one rests on. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadAll<[BrandView, IdeaView[], Channel[]]>([getBrand(id), getIdeas({ brandId: id }), getChannels(id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, ideas, channels] = res.data;
  const connected = [...new Set(channels.map((c) => c.platform))];
  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <h2 style={{ margin: 0 }}>Preview Brand Memory</h2>
        <p className="muted small" style={{ margin: 0, maxWidth: '72ch' }}>
          Draft the same thing twice: once as {brand.name}, once with an empty memory. See what the voice, rules and knowledge actually change, and where each rule came from. Nothing is saved.
        </p>
      </div>
      <PreviewForm brandId={brand.id} brandName={brand.name} ideas={ideas.filter((i) => i.status !== 'live').slice(0, 40)} platforms={connected.length ? connected : ALL} />
    </div>
  );
}

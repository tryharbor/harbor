import Link from 'next/link';
import { getBrand, getCompetitors, getMemoryProposals, getPosts, loadAll, type BrandView, type Competitor, type MemoryProposal, type PostView } from '../../../api';
import { VoiceEvidence } from '../../../components/voice-evidence';
import { BrandingSection, BusinessSection, CompetitorsSection, ListSection, MemoryPreview, StyleSection, VoiceSection } from '../../../components/memory-sections';
import { Flash, LoadError } from '../../../ui';

export const dynamic = 'force-dynamic';

const SECTIONS = [
  { key: 'business', label: 'Business' },
  { key: 'branding', label: 'Branding' },
  { key: 'voice', label: 'Voice' },
  { key: 'audiences', label: 'Audiences' },
  { key: 'products', label: 'Products' },
  { key: 'competitors', label: 'Competitors' },
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'style', label: 'Style rules' },
  { key: 'examplePosts', label: 'Example posts' },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

export default async function MemoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string; notice?: string; error?: string }> }) {
  const { id } = await params;
  const s = await searchParams;
  const requested = SECTIONS.find((x) => x.key === s.section)?.key;
  const res = await loadAll<[BrandView, Competitor[]]>([getBrand(id), getCompetitors(id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand, competitors] = res.data;
  // A person's account starts on Voice; a business starts on what it is.
  const section: Section = (requested ?? (brand.kind === 'person' ? 'voice' : 'business')) as Section;
  const extra = section === 'voice'
    ? await loadAll<[PostView[], MemoryProposal[]]>([
        getPosts({ brandId: id, status: 'published', limit: '200' }),
        getMemoryProposals({ brandId: id, status: 'pending' }).then((r) => r.data),
      ])
    : { ok: true as const, data: [[], []] as [PostView[], MemoryProposal[]] };
  if (!extra.ok) return <LoadError message={extra.error} />;
  const [posts, proposals] = extra.data;
  const returnTo = `/brands/${id}/memory?section=${section}`;
  const counts: Partial<Record<Section, number>> = {
    audiences: brand.memory.audiences.length,
    products: brand.memory.products.length,
    competitors: competitors.length,
    knowledge: brand.memory.knowledge.length,
    examplePosts: brand.memory.examplePosts.length,
  };

  return (
    <>
      <Flash params={s} />
      <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }} className="memory-layout">
        <nav className="stack" style={{ gap: 2, position: 'sticky', top: 24 }} aria-label="Business Memory sections">
          <span className="label" style={{ padding: '0 10px 6px' }}>Business Memory</span>
          {SECTIONS.map((x) => (
            <Link key={x.key} href={`/brands/${id}/memory?section=${x.key}`} className="nav-link" aria-current={x.key === section ? 'page' : undefined}>
              <span style={{ flex: 1 }}>{x.label}</span>
              {counts[x.key] !== undefined ? <span className="mono dim small">{counts[x.key]}</span> : null}
            </Link>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          {section === 'voice' ? (
            <div className="stack-lg">
              <VoiceEvidence brand={brand} posts={posts} proposals={proposals} returnTo={returnTo} />
              <VoiceSection brand={brand} returnTo={returnTo} />
            </div>
          ) : null}
          {section === 'audiences' || section === 'products' || section === 'knowledge' || section === 'examplePosts' ? <ListSection brand={brand} list={section} returnTo={returnTo} /> : null}
          {section === 'business' ? <BusinessSection brand={brand} returnTo={returnTo} /> : null}
          {section === 'branding' ? <BrandingSection brand={brand} returnTo={returnTo} /> : null}
          {section === 'competitors' ? <CompetitorsSection brandId={id} brandName={brand.name} competitors={competitors} returnTo={returnTo} /> : null}
          {section === 'style' ? <StyleSection brand={brand} returnTo={returnTo} /> : null}
        </div>
        <MemoryPreview brand={brand} competitors={competitors} />
      </div>
      <style>{`@media (max-width: 1180px) { .memory-layout { grid-template-columns: 1fr !important; } .memory-layout > nav { position: static !important; display: flex !important; flex-wrap: wrap; } }`}</style>
    </>
  );
}

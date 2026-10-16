import type { ReactNode } from 'react';
import { getBrand, loadAll, type BrandView } from '../../api';
import { TabLink } from '../../nav-link';
import { BrandMark, LoadError, PageHeader } from '../../ui';

export default async function BrandLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await loadAll<[BrandView]>([getBrand(id)]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [brand] = res.data;
  return (
    <>
      <PageHeader title={<span className="row" style={{ gap: 14 }}><BrandMark name={brand.name} logoUrl={brand.logoUrl} size={40} />{brand.name}</span>} sub={brand.memory.products[0]?.summary || undefined} />
      <nav className="tabs" aria-label={`${brand.name} sections`}>
        <TabLink href={`/brands/${id}`}>Overview</TabLink>
        <TabLink href={`/brands/${id}/memory`}>Brand Memory</TabLink>
        <TabLink href={`/brands/${id}/preview`}>Preview</TabLink>
        <TabLink href={`/brands/${id}/channels`}>Channels</TabLink>
      </nav>
      {children}
    </>
  );
}

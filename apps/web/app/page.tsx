import Link from 'next/link';
import type { Brand } from '@harbor/core';
import { createBrand } from './actions';
import { ApiError, getBrands } from './api';

// Always render on request: the API is the source of truth.
export const dynamic = 'force-dynamic';

export default async function BrandsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  let brands: Brand[] = [];
  let loadError: string | undefined;
  try {
    brands = await getBrands();
  } catch (err) {
    loadError = err instanceof ApiError ? err.message : 'Could not load brands.';
  }

  return (
    <main>
      <h1>Harbor</h1>
      {error || loadError ? <p className="error" role="alert">{error ?? loadError}</p> : null}
      <section>
        <h2>Your brands</h2>
        {brands.length === 0 ? (
          <p className="muted">No brands yet. Add the first one below.</p>
        ) : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {brands.map((b) => (
              <li key={b.id}>
                <Link href={`/brands/${b.id}`}><strong>{b.name}</strong></Link>
                {b.memory.offer.summary ? <span className="muted"> · {b.memory.offer.summary}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2>Add a brand</h2>
        <form action={createBrand} className="row">
          <label htmlFor="name" className="muted">Name</label>
          <input id="name" name="name" required maxLength={200} placeholder="e.g. Harbor" style={{ flex: '1 1 240px' }} />
          <button className="primary" type="submit">Add brand</button>
        </form>
      </section>
    </main>
  );
}

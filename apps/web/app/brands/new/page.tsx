import { createBrand } from '../../actions';
import { Flash, PageHeader } from '../../ui';

export default async function NewBrandPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const flash = await searchParams;
  return (
    <>
      <PageHeader title="Add a brand" sub="A brand is anything you post for: a product, a company, your personal account." />
      <Flash params={flash} />
      <section>
        <form action={createBrand} className="stack" style={{ maxWidth: 480 }}>
          <div className="field">
            <label htmlFor="name">Brand name</label>
            <input id="name" name="name" required maxLength={200} placeholder="e.g. Harbor" autoFocus />
          </div>
          <p className="muted small">Next you'll describe how it sounds and who it's for, then connect its accounts.</p>
          <div><button className="primary" type="submit">Add brand</button></div>
        </form>
      </section>
    </>
  );
}

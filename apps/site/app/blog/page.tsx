import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '../../components/reveal';
import { PageHero } from '../../components/ui';
import { formatDate, getPosts } from '../../lib/blog';
import './blog.css';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Notes from building Harbor in public: the decisions behind it, how it works and what we got wrong.',
  alternates: { canonical: '/blog', types: { 'application/rss+xml': '/blog/rss.xml' } },
};

export default function BlogIndex() {
  const posts = getPosts();
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Notes from building Harbor."
        lede="The decisions behind Harbor, how its pieces work, and what we learn along the way. Written by the people building it."
        actions={<a className="btn sm" href="/blog/rss.xml">RSS feed</a>}
      />
      <section className="container" style={{ paddingBottom: 'clamp(72px, 11vw, 160px)' }}>
        {posts.length ? (
          <ol className="blog-list">
            {posts.map((p, i) => (
              <Reveal as="li" key={p.slug} delay={i * 70}>
                <Link href={`/blog/${p.slug}`} className="blog-item">
                  <span className="blog-meta">
                    <time dateTime={p.date} className="label">{formatDate(p.date)}</time>
                    <span className="label">{p.minutes} min read</span>
                  </span>
                  <span className="blog-main">
                    <strong className="blog-title">{p.title}</strong>
                    <span className="muted">{p.description}</span>
                    <span className="row" style={{ gap: 8 }}>{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>
                  </span>
                  <span className="blog-arrow" aria-hidden="true">→</span>
                </Link>
              </Reveal>
            ))}
          </ol>
        ) : (
          <p className="muted">No posts yet.</p>
        )}
      </section>
    </>
  );
}

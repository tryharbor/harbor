import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Reveal } from '../../../components/reveal';
import { CtaBand } from '../../../components/ui';
import { formatDate, getPost, getPosts } from '../../../lib/blog';
import '../blog.css';
import { JsonLd, blogPosting } from '../../../lib/jsonld';

export const dynamicParams = false;

export function generateStaticParams() {
  return getPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return { title: 'Not found' };
  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    alternates: { canonical: `/blog/${post.slug}`, types: { 'application/rss+xml': '/blog/rss.xml' } },
    openGraph: { type: 'article', title: post.title, description: post.description, url: `/blog/${post.slug}`, publishedTime: post.date, authors: [post.author], tags: post.tags },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const others = getPosts().filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <>
      <JsonLd data={blogPosting(post)} />
      <article className="section blog-article">
        <div className="container">
          <Reveal>
            <Link href="/blog" className="label blog-back">← All posts</Link>
          </Reveal>
          <header className="blog-head">
            <Reveal delay={40}>
              <span className="eyebrow"><span className="pixels" /><time dateTime={post.date}>{formatDate(post.date)}</time><span aria-hidden="true">·</span>{post.minutes} min read</span>
            </Reveal>
            <Reveal delay={80}><h1 className="h1 blog-h1">{post.title}</h1></Reveal>
            <Reveal delay={120}><p className="lede" style={{ margin: 0, maxWidth: '56ch' }}>{post.description}</p></Reveal>
            <Reveal delay={160}>
              <div className="row blog-byline">
                <span className="blog-avatar" aria-hidden="true">{post.author.slice(0, 1)}</span>
                <span><strong>{post.author}</strong><span className="dim">, founder of Harbor</span></span>
                <span className="row" style={{ gap: 8, marginLeft: 'auto' }}>{post.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span>
              </div>
            </Reveal>
          </header>
          <Reveal delay={200}>
            <div className="prose blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />
          </Reveal>
        </div>
      </article>

      {others.length ? (
        <section className="section tight rule">
          <div className="container stack" style={{ gap: 24 }}>
            <span className="label">More from the blog</span>
            <div className="cards">
              {others.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="card">
                  <time dateTime={p.date} className="label">{formatDate(p.date)}</time>
                  <strong style={{ fontWeight: 500, fontSize: 22, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{p.title}</strong>
                  <span className="muted small">{p.description}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <CtaBand />
    </>
  );
}

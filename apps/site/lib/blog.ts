import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';

/**
 * The blog: markdown files in content/blog/*.md with a small YAML-ish frontmatter block:
 *
 *   ---
 *   title: Why Harbor never posts without you
 *   date: 2026-10-15
 *   description: One line for the index and the feed.
 *   author: Derek
 *   tags: [agents, approvals]
 *   updated: 2026-11-02          (optional: when facts were last checked)
 *   ---
 *
 * A "## FAQ" (or "## Frequently asked questions") section whose "### " headings are questions becomes FAQPage
 * structured data, so search engines and assistants can quote the answers.
 *
 * Read at build time only (every blog route is static).
 *
 * A post dated in the future stays out of every listing, the feed, the sitemap and its own URL until a build on or
 * after that date (in BLOG_TIMEZONE, default America/Chicago). So posts can be written ahead and go live with the
 * first deploy on their day. BLOG_SHOW_SCHEDULED=1 includes them, for local previews.
 */

export type PostMeta = { slug: string; title: string; date: string; updated?: string; description: string; author: string; tags: string[] };
export type Post = PostMeta & { html: string; markdown: string; minutes: number; faq: { q: string; a: string }[] };

const DIR = join(process.cwd(), 'content', 'blog');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const unquote = (v: string) => {
  const t = v.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t;
};

/** `key: value` lines between two `---` lines. Values may be quoted; lists are `[a, b]` or `a, b`. */
export function parseFrontmatter(source: string): { data: Record<string, string | string[]>; body: string } {
  const text = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data: Record<string, string | string[]> = {};
  for (const line of m[1]!.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    data[key] = raw.startsWith('[') && raw.endsWith(']')
      ? raw.slice(1, -1).split(',').map(unquote).filter(Boolean)
      : unquote(raw);
  }
  return { data, body: text.slice(m[0].length) };
}

const str = (v: string | string[] | undefined, field: string, file: string) => {
  if (typeof v !== 'string' || !v) throw new Error(`content/blog/${file}: frontmatter needs "${field}".`);
  return v;
};
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const marked = new Marked({ gfm: true });

/** Markdown to plain text, enough for structured-data answers: links keep their text, emphasis and code marks go. */
const plain = (md: string) =>
  md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();

/** Questions and answers from the post's FAQ section ("## FAQ", then "### Question" with the answer below). */
export function extractFaq(body: string): { q: string; a: string }[] {
  const start = /^##\s+(?:FAQ|Frequently asked questions)\s*$/im.exec(body);
  if (!start) return [];
  const rest = body.slice(start.index + start[0].length);
  const end = /^##\s/m.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  return section
    .split(/^###\s+/m)
    .slice(1)
    .map((block) => {
      const [q = '', ...answer] = block.split('\n');
      return { q: plain(q), a: plain(answer.join('\n')) };
    })
    .filter((f) => f.q && f.a);
}

function load(file: string): Post {
  const slug = file.replace(/\.md$/, '');
  if (!SLUG.test(slug)) throw new Error(`content/blog/${file}: file names are the slug (lowercase, dashes).`);
  const { data, body } = parseFrontmatter(readFileSync(join(DIR, file), 'utf8'));
  const date = str(data.date, 'date', file);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`content/blog/${file}: date must be YYYY-MM-DD.`);
  const updated = typeof data.updated === 'string' && data.updated ? data.updated : undefined;
  if (updated && !/^\d{4}-\d{2}-\d{2}$/.test(updated)) throw new Error(`content/blog/${file}: updated must be YYYY-MM-DD.`);
  const html = marked.parse(body, { async: false });
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: str(data.title, 'title', file),
    date,
    ...(updated ? { updated } : {}),
    description: str(data.description, 'description', file),
    author: str(data.author, 'author', file),
    tags: list(data.tags),
    html,
    markdown: body,
    minutes: Math.max(1, Math.round(words / 230)),
    faq: extractFaq(body),
  };
}

/** Today where the posts are published, as YYYY-MM-DD. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.BLOG_TIMEZONE || 'America/Chicago' }).format(new Date());
const isLive = (p: PostMeta) => process.env.BLOG_SHOW_SCHEDULED === '1' || p.date <= today();

/** Every published post (dated today or earlier), newest first. */
export function getPosts(): Post[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  // Every file is still parsed, so a broken scheduled post fails the build before its day, not on it.
  return files.map(load).filter(isLive).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): Post | undefined {
  return getPosts().find((p) => p.slug === slug);
}

/** "October 15, 2026", fixed to UTC so the build machine's zone doesn't shift the day. */
export function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

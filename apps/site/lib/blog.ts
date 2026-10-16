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
 *   ---
 *
 * Read at build time only (every blog route is static).
 */

export type PostMeta = { slug: string; title: string; date: string; description: string; author: string; tags: string[] };
export type Post = PostMeta & { html: string; markdown: string; minutes: number };

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

function load(file: string): Post {
  const slug = file.replace(/\.md$/, '');
  if (!SLUG.test(slug)) throw new Error(`content/blog/${file}: file names are the slug (lowercase, dashes).`);
  const { data, body } = parseFrontmatter(readFileSync(join(DIR, file), 'utf8'));
  const date = str(data.date, 'date', file);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`content/blog/${file}: date must be YYYY-MM-DD.`);
  const html = marked.parse(body, { async: false });
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    slug,
    title: str(data.title, 'title', file),
    date,
    description: str(data.description, 'description', file),
    author: str(data.author, 'author', file),
    tags: list(data.tags),
    html,
    markdown: body,
    minutes: Math.max(1, Math.round(words / 230)),
  };
}

/** Every post, newest first. */
export function getPosts(): Post[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
  return files.map(load).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

export function getPost(slug: string): Post | undefined {
  return getPosts().find((p) => p.slug === slug);
}

/** "October 15, 2026", fixed to UTC so the build machine's zone doesn't shift the day. */
export function formatDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

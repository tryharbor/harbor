import { z } from 'zod';
import { platformSchema } from './metrics.ts';

/**
 * Brand Memory v2: everything Harbor knows about a brand that should shape strategy and drafting.
 *
 * Stored as one JSONB document per brand. Documents written by v1 (voice.description/traits/dont, offer, audience)
 * are migrated on read by `brandMemorySchema` (see migrateBrandMemory), so old rows keep working without a data
 * migration. List items carry short ids; the API generates random ones for new items, and items read from old
 * documents get stable ids derived from their content until the brand is saved again.
 */

const timestamp = z.string().datetime({ offset: true });
const itemId = z.string().min(1).max(64);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.length > 0) : []);
const nonEmpty = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v : undefined);

// ---- v1 → v2 migration ----

/** v1 voice {description, traits, do, dont} → v2 {summary, values, do, avoid}. v2 fields win when both exist. */
export function migrateVoice(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const v: Obj = { ...raw };
  if ('description' in v) {
    if (v.summary === undefined) v.summary = typeof v.description === 'string' ? v.description : '';
    delete v.description;
  }
  if ('traits' in v) {
    if (v.values === undefined) v.values = strings(v.traits).map((name) => ({ name, meaning: '' }));
    delete v.traits;
  }
  if ('dont' in v) {
    if (v.avoid === undefined) v.avoid = strings(v.dont);
    delete v.dont;
  }
  return v;
}

/**
 * Turn a v1 Brand Memory document (or a v1-shaped partial patch) into v2 keys. v1 `offer` becomes products[0]
 * ("Main offer") and v1 `audience` becomes audiences[0] ("Primary audience"), but only when they held something.
 * v2 keys already present are kept as they are.
 */
export function migrateBrandMemory(raw: unknown): unknown {
  if (!isObj(raw)) return raw;
  const out: Obj = { ...raw };
  if ('offer' in out) {
    const offer = isObj(out.offer) ? out.offer : {};
    delete out.offer;
    const summary = nonEmpty(offer.summary);
    const cta = nonEmpty(offer.callToAction);
    const url = nonEmpty(offer.url);
    if (out.products === undefined && (summary || cta || url)) {
      out.products = [{ name: 'Main offer', summary: summary ?? '', cta, url, proofPoints: [] }];
    }
  }
  if ('audience' in out) {
    const a = isObj(out.audience) ? out.audience : {};
    delete out.audience;
    const description = nonEmpty(a.description);
    const painPoints = strings(a.painPoints);
    const segments = strings(a.segments);
    if (out.audiences === undefined && (description || painPoints.length || segments.length)) {
      out.audiences = [{ name: 'Primary audience', description: description ?? '', painPoints, goals: [], segments }];
    }
  }
  if ('voice' in out) out.voice = migrateVoice(out.voice);
  return out;
}

const LIST_KEYS = ['audiences', 'products', 'knowledge', 'examplePosts'] as const;

/** Stable id from an item's content and position (FNV-1a, base36). Used only for items stored without an id. */
export function stableItemId(key: string, index: number, item: unknown): string {
  const text = `${key}:${index}:${JSON.stringify(item)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).padEnd(10, '0').slice(0, 10);
}

/** Give every list item (audiences, products, knowledge, examplePosts) an id if it has none. */
export function fillMemoryIds(
  raw: unknown,
  gen: (key: string, index: number, item: Obj) => string = stableItemId,
): unknown {
  if (!isObj(raw)) return raw;
  let out: Obj = raw;
  for (const key of LIST_KEYS) {
    const list = raw[key];
    if (!Array.isArray(list)) continue;
    out = {
      ...out,
      [key]: list.map((item, i) =>
        isObj(item) && (typeof item.id !== 'string' || item.id.length === 0) ? { ...item, id: gen(key, i, item) } : item,
      ),
    };
  }
  return out;
}

const prepare = (raw: unknown) => fillMemoryIds(migrateBrandMemory(raw ?? {}));

// ---- v2 schemas ----

export const voiceValueSchema = z.object({
  name: z.string().trim().min(1).max(100),
  meaning: z.string().max(1000).default(''),
});
export type VoiceValue = z.infer<typeof voiceValueSchema>;

export const voiceExcerptSchema = z.object({
  text: z.string().min(1).max(2000),
  /** Where the excerpt came from (e.g. "example 2", a URL). */
  source: z.string().optional(),
});

export const voiceSourceSchema = z.object({
  kind: z.enum(['example', 'url', 'post']),
  label: z.string().min(1).max(300),
  ref: z.string().optional(),
});

export const brandVoiceSchema = z.preprocess(
  migrateVoice,
  z.object({
    summary: z.string().max(4000).default(''),
    values: z.array(voiceValueSchema).default([]),
    do: z.array(z.string()).default([]),
    avoid: z.array(z.string()).default([]),
    /** Words drafts must never use. */
    bannedWords: z.array(z.string()).default([]),
    /** Verbatim sentences that best show the voice. */
    excerpts: z.array(voiceExcerptSchema).default([]),
    /** What the voice was learned from. */
    sources: z.array(voiceSourceSchema).default([]),
    learnedAt: timestamp.optional(),
    /** Model name that learned it (e.g. "simulated-v1"). */
    learnedBy: z.string().optional(),
  }),
);
export type BrandVoice = z.infer<typeof brandVoiceSchema>;

export const audienceSchema = z.object({
  id: itemId,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(''),
  painPoints: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  /** Carried over from v1 `audience.segments`; absent on audiences created in v2. */
  segments: z.array(z.string()).optional(),
});
export type Audience = z.infer<typeof audienceSchema>;

export const productSchema = z.object({
  id: itemId,
  name: z.string().trim().min(1).max(200),
  summary: z.string().max(4000).default(''),
  url: z.string().url().optional(),
  cta: z.string().max(300).optional(),
  proofPoints: z.array(z.string()).default([]),
});
export type Product = z.infer<typeof productSchema>;

export const knowledgeItemSchema = z.object({
  id: itemId,
  title: z.string().trim().min(1).max(300),
  kind: z.enum(['note', 'link']),
  body: z.string().max(20_000).optional(),
  url: z.string().url().optional(),
});
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;

export const styleRulesSchema = z.object({
  /** Preferred terms, e.g. { use: 'customers', insteadOf: 'users' }. */
  terms: z.array(z.object({ use: z.string().min(1), insteadOf: z.string().min(1) })).default([]),
  /** Formatting rules, e.g. "No hashtags", "Sentence case headlines". */
  formatting: z.array(z.string()).default([]),
});
export type StyleRules = z.infer<typeof styleRulesSchema>;

export const examplePostSchema = z.object({
  id: itemId,
  platform: platformSchema.optional(),
  text: z.string().min(1),
  url: z.string().url().optional(),
  /** Why this is a good (or bad) example of the brand's voice. */
  note: z.string().optional(),
});
export type ExamplePost = z.infer<typeof examplePostSchema>;

const memoryShape = {
  voice: brandVoiceSchema,
  audiences: z.array(audienceSchema),
  products: z.array(productSchema),
  knowledge: z.array(knowledgeItemSchema),
  styleRules: styleRulesSchema,
  examplePosts: z.array(examplePostSchema),
};

/** Brand Memory v2. Accepts v1 documents and migrates them. */
export const brandMemorySchema = z.preprocess(
  prepare,
  z.object({
    voice: memoryShape.voice.default({}),
    audiences: memoryShape.audiences.default([]),
    products: memoryShape.products.default([]),
    knowledge: memoryShape.knowledge.default([]),
    styleRules: memoryShape.styleRules.default({}),
    examplePosts: memoryShape.examplePosts.default([]),
  }),
);
export type BrandMemory = z.infer<typeof brandMemorySchema>;

/**
 * A PATCH to Brand Memory: each top-level key given replaces that key entirely; keys left out are kept.
 * v1-shaped keys (offer, audience) are migrated first.
 */
export const brandMemoryPatchSchema = z.preprocess(
  (raw) => fillMemoryIds(migrateBrandMemory(raw)),
  z
    .object({
      voice: memoryShape.voice.optional(),
      audiences: memoryShape.audiences.optional(),
      products: memoryShape.products.optional(),
      knowledge: memoryShape.knowledge.optional(),
      styleRules: memoryShape.styleRules.optional(),
      examplePosts: memoryShape.examplePosts.optional(),
    })
    .strict(),
);
export type BrandMemoryPatch = z.infer<typeof brandMemoryPatchSchema>;

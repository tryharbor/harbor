import { preferredVariant, type Brand, type Platform, type PostPart } from '@harbor/core';
import type { AppDeps } from '../app.ts';
import { DEFAULT_MAX } from './drafts.ts';
import { checkPartsMedia, mediaLookup, type MediaAssetRow } from './media.ts';

/**
 * The voice check: deterministic, no model call. Banned words and the voice's avoid phrases, length against the
 * platform limit, hashtag count, the style rules that can be checked mechanically, the hook, and the media (the
 * platform's media rules, and whether the recommended crop is used).
 */

export interface Check {
  key: string;
  ok: boolean;
  severity: 'info' | 'warn' | 'fail';
  label: string;
  detail: string;
}

/** Above this many hashtags a post on these platforms reads as spam. */
export const MAX_HASHTAGS = 3;
const HASHTAG_PLATFORMS: Platform[] = ['x', 'linkedin', 'threads'];
/** A hook shorter than this (characters) is too thin to stop anyone scrolling. */
export const MIN_HOOK_CHARS = 20;

export const PLATFORM_NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const HASHTAGS = /#[\p{L}\p{N}_]+/gu;
const HASHTAG = /#[\p{L}\p{N}_]+/u;
const EMOJI = /\p{Extended_Pictographic}/u;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word, case-insensitive match (phrases allowed). */
const hasTerm = (text: string, term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text);
const quote = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ');

/** Phrases an avoid rule names: anything quoted, and a list after a colon ("Hype words: leverage, unlock."). */
export function avoidPhrases(rule: string): string[] {
  const out = [...rule.matchAll(/["“]([^"”]{2,60})["”]/g)].map((m) => m[1]!.trim());
  const colon = rule.indexOf(':');
  if (colon >= 0) {
    for (const p of rule.slice(colon + 1).split(/,|\bor\b|\band\b/)) {
      const t = p.replace(/[.()"“”]/g, '').trim();
      if (t && t.split(/\s+/).length <= 4) out.push(t);
    }
  }
  return [...new Set(out.map((p) => p.toLowerCase()))];
}

const pass = (key: string, label: string, detail: string): Check => ({ key, ok: true, severity: 'info', label, detail });

/**
 * `assets` are the library assets the draft's media references (see mediaLookup); without them, library media is
 * checked from its URL only.
 */
export function voiceCheck(
  brand: Pick<Brand, 'memory'>,
  draft: { platform: Platform; parts: PostPart[] },
  maxLength: number,
  assets: ReadonlyMap<string, MediaAssetRow> = new Map(),
): Check[] {
  const { voice, styleRules } = brand.memory;
  const text = draft.parts.map((p) => p.text).join('\n');
  const checks: Check[] = [];

  const banned = voice.bannedWords.filter((w) => w.trim() && hasTerm(text, w));
  checks.push(
    banned.length
      ? { key: 'banned_words', ok: false, severity: 'fail', label: 'Banned words', detail: `Uses ${quote(banned)}.` }
      : pass('banned_words', 'Banned words', voice.bannedWords.length ? 'None of the banned words.' : 'No banned words set.'),
  );

  const avoidHits: string[] = [];
  for (const rule of voice.avoid) {
    if (/exclamation/i.test(rule) && text.includes('!')) avoidHits.push('exclamation marks');
    if (/hashtag/i.test(rule) && HASHTAG.test(text)) avoidHits.push('hashtags');
    for (const p of avoidPhrases(rule)) if (!banned.some((b) => b.toLowerCase() === p) && hasTerm(text, p)) avoidHits.push(p);
  }
  const avoid = [...new Set(avoidHits)];
  checks.push(
    avoid.length
      ? { key: 'avoid', ok: false, severity: 'warn', label: 'Avoid list', detail: `The voice avoids ${quote(avoid)}.` }
      : pass('avoid', 'Avoid list', 'Nothing from the avoid list.'),
  );

  const long = draft.parts.map((p, i) => ({ i, n: [...p.text].length })).filter((p) => p.n > maxLength);
  const name = PLATFORM_NAMES[draft.platform];
  checks.push(
    long.length
      ? {
          key: 'length', ok: false, severity: 'fail', label: 'Length',
          detail: long.map((p) => `${draft.parts.length > 1 ? `Part ${p.i + 1}` : 'The post'} is ${p.n} characters; ${name} allows ${maxLength}.`).join(' '),
        }
      : pass('length', 'Length', `Within ${name}'s ${maxLength} characters.`),
  );

  const hashtags = text.match(HASHTAGS)?.length ?? 0;
  const tooMany = HASHTAG_PLATFORMS.includes(draft.platform) && hashtags > MAX_HASHTAGS;
  checks.push(
    tooMany
      ? { key: 'hashtags', ok: false, severity: 'warn', label: 'Hashtags', detail: `${hashtags} hashtags; keep it to ${MAX_HASHTAGS} or fewer on ${name}.` }
      : pass('hashtags', 'Hashtags', `${hashtags} hashtag${hashtags === 1 ? '' : 's'}.`),
  );

  // Style rules: preferred terms, and the formatting rules a regex can check.
  const style: string[] = [];
  for (const t of styleRules.terms) if (hasTerm(text, t.insteadOf)) style.push(`Use "${t.use}" instead of "${t.insteadOf}".`);
  for (const rule of styleRules.formatting) {
    if (/no hashtags?/i.test(rule) && hashtags > 0) style.push(`"${rule}", but the draft has ${hashtags}.`);
    if (/no emojis?/i.test(rule) && EMOJI.test(text)) style.push(`"${rule}", but the draft has emoji.`);
    if (/no exclamation/i.test(rule) && text.includes('!')) style.push(`"${rule}", but the draft has one.`);
  }
  checks.push(
    style.length
      ? { key: 'style_rules', ok: false, severity: 'warn', label: 'Style rules', detail: style.join(' ') }
      : pass('style_rules', 'Style rules', 'Follows the style rules that can be checked.'),
  );

  const hook = (draft.parts[0]?.text ?? '').split('\n')[0]!.trim();
  checks.push(
    !hook
      ? { key: 'hook', ok: false, severity: 'fail', label: 'Hook', detail: 'The hook (first line) is empty.' }
      : [...hook].length < MIN_HOOK_CHARS
        ? { key: 'hook', ok: false, severity: 'warn', label: 'Hook', detail: `The hook is very short (${[...hook].length} characters).` }
        : pass('hook', 'Hook', 'The first line works as a hook.'),
  );
  checks.push(mediaCheck(draft, assets));
  return checks;
}

/**
 * fail: Instagram without media, or anything checkMedia fails. warn: checkMedia's advice, or an image that isn't in
 * the platform's recommended crop. ok otherwise.
 */
function mediaCheck(draft: { platform: Platform; parts: PostPart[] }, assets: ReadonlyMap<string, MediaAssetRow>): Check {
  const name = PLATFORM_NAMES[draft.platform];
  const label = 'Media';
  const media = draft.parts.flatMap((p) => p.media);
  if (draft.platform === 'instagram' && !draft.parts[0]?.media.length) {
    return { key: 'media', ok: false, severity: 'fail', label, detail: 'Instagram needs an image or video. Attach one first.' };
  }
  const { issues } = checkPartsMedia(draft.platform, draft.parts, assets);
  const fails = issues.filter((i) => i.level === 'fail').map((i) => i.message);
  if (fails.length) return { key: 'media', ok: false, severity: 'fail', label, detail: fails.join(' ') };
  const warns = issues.filter((i) => i.level === 'warn').map((i) => i.message);
  if (!warns.length) {
    const preferred = preferredVariant(draft.platform);
    const off = [...new Set(media.filter((m) => m.kind === 'image' && m.assetId && m.variant && m.variant !== preferred).map((m) => m.variant!))];
    if (off.length) warns.push(`${name} works best with the ${preferred} crop; this uses ${off.join(', ')}.`);
  }
  if (warns.length) return { key: 'media', ok: false, severity: 'warn', label, detail: [...new Set(warns)].join(' ') };
  if (!media.length) return pass('media', label, `No media; ${name} posts can be text only.`);
  return pass('media', label, `${media.length} ${media.length === 1 ? 'item fits' : 'items fit'} ${name}.`);
}

/** The voice check for a stored draft, with its library assets loaded. */
export async function checkDraft(
  deps: Pick<AppDeps, 'db' | 'registry'>,
  brand: Pick<Brand, 'memory'>,
  draft: { platform: Platform; parts: PostPart[] },
): Promise<Check[]> {
  const max = deps.registry.get(draft.platform)?.maxLength() ?? DEFAULT_MAX[draft.platform];
  return voiceCheck(brand, draft, max, await mediaLookup(deps.db, [draft]));
}

/** "2 issues: Banned words, Length" or "All checks pass". */
export function checksSummary(checks: Check[]): string {
  const bad = checks.filter((c) => !c.ok);
  return bad.length ? `${bad.length} issue${bad.length === 1 ? '' : 's'}: ${bad.map((c) => c.label).join(', ')}` : 'All checks pass';
}

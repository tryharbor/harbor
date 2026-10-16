import type { DraftChange, RefineVoiceChangesInput } from './types.ts';
import { ensureEnd } from './text.ts';

/**
 * Rule wording per post feature, used by the simulated model to polish the voice refresh's changes. Every template
 * contains the feature's canonical phrase (see services/voice-learning.ts in the API), so a rule added from it is
 * recognized as covering that feature on the next refresh.
 */
export const VOICE_CHANGE_TEMPLATES: Record<string, { do: string; avoid: string }> = {
  firstPerson: { do: 'Open in the first person ("I", "My"): start with what you did.', avoid: 'Opening in the first person; lead with the reader or the result.' },
  numberOpen: { do: 'Open with a number ("3 things…", "$1,240…").', avoid: 'Opening with a number; lead with a scene or a claim instead.' },
  questionOpen: { do: 'Open with a question the reader would ask.', avoid: 'Opening with a question; state the point first.' },
  list: { do: 'Use a list, one item per line, when there are steps.', avoid: 'Bullet lists; write it as prose.' },
  linkFirst: { do: 'Put the link in the first part.', avoid: 'Links in the first part; put the link in a reply or at the end.' },
  hashtag: { do: 'Add one or two relevant hashtags.', avoid: 'Hashtags.' },
  emoji: { do: 'Use one emoji where it adds tone.', avoid: 'Emoji.' },
  short: { do: 'Keep posts short: under 120 characters.', avoid: 'Very short posts (under 120 characters); give the point room.' },
  long: { do: 'Go long when the point needs it: over 400 characters.', avoid: 'Long posts (over 400 characters); cut to the point.' },
  thread: { do: 'Turn bigger points into a thread.', avoid: 'Threads; say it in one post.' },
  endsQuestion: { do: 'End with a question for the reader.', avoid: 'Ending with a question; end on the point.' },
};

/**
 * Deterministic polish, one result per change in the same order: added do/avoid rules take their feature's template
 * and every `why` ends as a sentence. Removals and excerpts keep their text (a removal must match the stored rule).
 */
export function refineVoiceChanges(input: RefineVoiceChangesInput): DraftChange[] {
  return input.changes.map((c): DraftChange => {
    const t = c.feature ? VOICE_CHANGE_TEMPLATES[c.feature] : undefined;
    const text = c.op === 'add' && t && (c.target === 'voice.do' || c.target === 'voice.avoid') ? (c.target === 'voice.do' ? t.do : t.avoid) : c.text;
    return { ...c, text, why: ensureEnd(c.why) };
  });
}

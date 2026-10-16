import { describe, expect, it } from 'vitest';
import { fitToLimit } from '../src/routes/drafts.ts';

describe('fitToLimit', () => {
  it('leaves short text alone', () => expect(fitToLimit('Short.', 280)).toBe('Short.'));
  it('drops trailing sentences first', () => {
    expect(fitToLimit('One two three. Four five six. Seven eight nine.', 30)).toBe('One two three. Four five six.');
  });
  it('cuts a single long sentence with an ellipsis', () => {
    const out = fitToLimit('a'.repeat(300), 280);
    expect([...out].length).toBe(280);
    expect(out.endsWith('…')).toBe(true);
  });
});

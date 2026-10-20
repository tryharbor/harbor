import type { Migration } from '../migrations.ts';

/**
 * Managing replies from Harbor (Instagram): whether the account hid a reply, the account's own answers to it, and
 * when it was deleted. A deleted reply keeps its row (so a later fetch can't bring it back) but loses its text.
 */
export const replyActions0011: Migration = {
  id: '0011_reply_actions',
  statements: [
    `ALTER TABLE post_replies ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE post_replies ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE post_replies ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`,
  ],
};

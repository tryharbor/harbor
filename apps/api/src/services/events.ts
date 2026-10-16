import { newId } from '@harbor/core';
import type { Db } from '../db/client.ts';

export const AGENT_EVENTS = ['post_published', 'post_outperformed'] as const;
export type AgentEventType = (typeof AGENT_EVENTS)[number];

/**
 * Record something automations can react to. At most one event per (type, post), so a post that drops out of
 * 'outperformed' and comes back never fires twice. The worker picks events up on its next tick.
 */
export async function emitEvent(db: Db, type: AgentEventType, brandId: string, refId: string): Promise<void> {
  await db.query(
    'INSERT INTO agent_events (id, type, brand_id, ref_id) VALUES ($1, $2, $3, $4) ON CONFLICT (type, ref_id) DO NOTHING',
    [newId('agentEvent'), type, brandId, refId],
  );
}

import { z } from 'zod';
import { platformSchema } from '@harbor/core';
import type { App, AppDeps } from '../app.ts';
import { body } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import { deleteChat, listChats, loadChat, sendMessage, startChat, useOption } from '../services/assistant.ts';

const message = z.string().trim().min(1).max(2000);
const startSchema = z.object({ message, platforms: z.array(platformSchema).min(1).max(4).optional() }).strict();
const sendSchema = z.object({ message }).strict();

/** The social assistant: chats that turn a topic into three post options, and options into ideas with drafts. */
export function registerAssistant(app: App, deps: AppDeps) {
  const { db } = deps;

  /** ?brandId=. Newest first, without messages. */
  app.get('/v1/assistant/chats', async (c) => c.json({ data: await listChats(db, c.req.query('brandId') || undefined) }));

  app.post('/v1/brands/:id/assistant/chats', async (c) => {
    const input = await body(c, startSchema);
    const brand = await loadBrand(db, c.req.param('id'));
    const { chat } = await startChat(deps, brand, input);
    return c.json(chat, 201);
  });

  app.get('/v1/assistant/chats/:id', async (c) => c.json(await loadChat(db, c.req.param('id'))));

  app.post('/v1/assistant/chats/:id/messages', async (c) => {
    const input = await body(c, sendSchema);
    const chat = await loadChat(db, c.req.param('id'));
    const brand = await loadBrand(db, chat.brandId);
    return c.json(await sendMessage(deps, brand, chat, input.message));
  });

  /** Turn an option into an idea with its drafts (Studio). Idempotent per option. */
  app.post('/v1/assistant/chats/:id/options/:optionId/use', async (c) => {
    const chat = await loadChat(db, c.req.param('id'));
    const { ideaId, draftIds } = await useOption(db, chat, c.req.param('optionId'));
    return c.json({ ideaId, draftIds });
  });

  app.delete('/v1/assistant/chats/:id', async (c) => {
    await deleteChat(db, c.req.param('id'));
    return c.body(null, 204);
  });
}

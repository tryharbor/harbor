import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type App } from '../src/app.ts';
import { openDb, type Db } from '../src/db/client.ts';
import sharp from 'sharp';
import { headlineFrom, readIntent, topicOf } from '../src/services/assistant.ts';
import { designSvg, listItems, markOn, wrap } from '../src/services/design-render.ts';
import { RICH_MEMORY, sender } from './helpers.ts';

let db: Db;
let app: App;
let brandId: string;
const send = sender(() => app);

beforeAll(async () => {
  db = await openDb('memory://');
  app = createApp(db, { publishMode: 'sandbox', modelMode: 'simulated' });
  brandId = (await (await send('POST', '/v1/brands', {
    name: 'Tidewater',
    memory: { ...RICH_MEMORY, branding: { tagline: 'Coffee worth waiting for.', colors: [{ hex: '#c0583a', role: 'primary' }] } },
  })).json()).id;
});
afterAll(() => db.close());

describe('reading messages', () => {
  it('pulls the topic out of a request', () => {
    expect(topicOf('Can you write a post about our new Ethiopian roast?')).toBe('Our new Ethiopian roast');
    expect(topicOf('I want to announce our spring menu')).toBe('Our spring menu');
    expect(topicOf('Why we started')).toBe('Why we started');
  });

  it('treats short follow-ups as refinements only when there are options', () => {
    expect(readIntent('shorter please', true)).toEqual({ kind: 'refine', instruction: 'shorter' });
    expect(readIntent('make them punchier', true)).toEqual({ kind: 'refine', instruction: 'punchier' });
    expect(readIntent('give me other hooks', true)).toEqual({ kind: 'refine', instruction: 'hook_variations' });
    expect(readIntent('show me different angles', true)).toEqual({ kind: 'more' });
    expect(readIntent('shorter please', false)).toMatchObject({ kind: 'topic' });
    expect(readIntent('hello', false)).toEqual({ kind: 'greeting' });
  });

  it('makes a clean design headline', () => {
    expect(headlineFrom('Fresh beans, every two weeks. Order now at https://x.co #coffee', 'x')).toBe('Fresh beans, every two weeks.');
    expect(headlineFrom('#only #tags', 'Fallback')).toBe('Fallback');
    expect(headlineFrom('[Tell the story.] Roasted this week.', 'x')).toBe('Roasted this week.');
  });
});

describe('design rendering', () => {
  const brand = { name: 'Tidewater (demo)', logoUrl: undefined, memory: { branding: { tagline: '', colors: [{ hex: '#c0583a', role: 'primary' }, { hex: '#e8d5b5', role: 'secondary' }], fonts: { heading: '', body: '' } } } } as never;

  it('wraps to the width and cuts with an ellipsis', () => {
    expect(wrap('one two three four five six', 100, 500, 9).lines).toEqual(['one two', 'three', 'four five', 'six']);
    const cut = wrap('one two three four five six', 100, 500, 2);
    expect(cut).toEqual({ lines: ['one two', 'three…'], cut: true });
  });

  it('never draws a mark in the colour of its background', () => {
    expect(markOn('#e8d5b5', '#e8d5b5', '#c0583a')).toBe('#c0583a');
    expect(markOn('#ffffff', '#fefefe')).toBe('#111111');
  });

  it("takes list items from the draft's own list, or its sentences without links or tags", () => {
    expect(listItems('Headline here.\n\n[Add the steps.]\n\n- Grind fresh\n- Use 15 g\n- Pour slowly #coffee', 'Headline here.')).toEqual(['Grind fresh', 'Use 15 g', 'Pour slowly #coffee']);
    expect(listItems('Roasted this week. Shipped in 48 hours. https://x.co #beans', 'Roasted this week.')).toEqual(['Shipped in 48 hours.']);
    expect(listItems('Tip. [Add steps.]. Grind fresh.', 'Tip.')).toEqual(['Grind fresh.']);
  });

  it('escapes text and leaves out emoji and the demo suffix', () => {
    const svg = designSvg(brand, { layout: 'headline', label: 'Tip', headline: 'Beans & <brews> ☕ today' });
    expect(svg).toContain('Beans &amp; &lt;brews&gt;');
    expect(svg).not.toContain('☕');
    expect(svg).toContain('>Tidewater<');
  });
});

describe('/v1/assistant', () => {
  let chatId: string;
  let firstOptionId: string;

  it('answers a topic with three options, drafted for each platform and designed', async () => {
    const res = await send('POST', `/v1/brands/${brandId}/assistant/chats`, { message: 'Write a post about our new Ethiopian roast', platforms: ['instagram', 'x'] });
    expect(res.status).toBe(201);
    const chat = await res.json();
    chatId = chat.id;
    expect(chat.id).toMatch(/^cht_/);
    expect(chat.title).toBe('Our new Ethiopian roast');
    expect(chat.messages).toHaveLength(2);
    const reply = chat.messages[1];
    expect(reply).toMatchObject({ role: 'assistant', simulated: true, runId: expect.stringMatching(/^run_/) });
    expect(reply.options.map((o: { kind: string }) => o.kind)).toEqual(['story', 'tip', 'announcement']);
    for (const o of reply.options) {
      expect(o.drafts.map((d: { platform: string }) => d.platform)).toEqual(['instagram', 'x']);
      expect(o.drafts[0].parts[0].text.length).toBeGreaterThan(0);
      expect(o.design.headline).not.toMatch(/\[/);
      expect(o.design.sub).toBe('Coffee worth waiting for.');
    }
    expect(new Set(reply.options.map((o: { design: { layout: string } }) => o.design.layout)).size).toBe(3);
    expect(reply.options[2].drafts[0].parts[0].text).toMatch(/^Introducing our new Ethiopian roast/);
    firstOptionId = reply.options[0].id;
    const runs = (await (await send('GET', `/v1/agent-runs?brandId=${brandId}`)).json()).data;
    expect(runs[0]).toMatchObject({ id: reply.runId, kind: 'assistant', status: 'succeeded' });
  });

  it('reworks the latest options on a follow-up', async () => {
    const before = (await (await send('GET', `/v1/assistant/chats/${chatId}`)).json()).messages[1].options;
    const chat = await (await send('POST', `/v1/assistant/chats/${chatId}/messages`, { message: 'shorter please' })).json();
    const reply = chat.messages.at(-1);
    expect(chat.messages).toHaveLength(4);
    expect(reply.text).toMatch(/shorter/);
    expect(reply.options).toHaveLength(3);
    expect(reply.options[0].drafts[0].parts[0].text.length).toBeLessThanOrEqual(before[0].drafts[0].parts[0].text.length);
  });

  it('offers different angles when asked', async () => {
    const chat = await (await send('POST', `/v1/assistant/chats/${chatId}/messages`, { message: 'different angles' })).json();
    expect(chat.messages.at(-1).options.map((o: { kind: string }) => o.kind)).toEqual(['question', 'behind', 'proof']);
  });

  it('draws each option as a 1080×1080 PNG', async () => {
    const res = await send('GET', `/v1/assistant/chats/${chatId}/options/${firstOptionId}/design.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1080, 1080]);
    expect((await send('GET', `/v1/assistant/chats/${chatId}/options/nope/design.png`)).status).toBe(404);
  });

  it('turns an option into an idea with drafts, once', async () => {
    const res = await send('POST', `/v1/assistant/chats/${chatId}/options/${firstOptionId}/use`);
    expect(res.status).toBe(200);
    const { ideaId, draftIds, mediaId } = await res.json();
    expect(ideaId).toMatch(/^ida_/);
    expect(mediaId).toMatch(/^med_/);
    const asset = await (await send('GET', `/v1/media/${mediaId}`)).json();
    expect(asset).toMatchObject({ kind: 'image', mime: 'image/png', width: 1080, height: 1080, tags: ['assistant'] });
    expect(draftIds).toHaveLength(2);
    const ideas = (await (await send('GET', `/v1/ideas?brandId=${brandId}`)).json()).data;
    expect(ideas.find((i: { id: string }) => i.id === ideaId)).toMatchObject({ title: 'Our new Ethiopian roast', status: 'drafting' });
    const drafts = (await (await send('GET', `/v1/drafts?ideaId=${ideaId}`)).json()).data;
    expect(drafts.map((d: { platform: string; author: string }) => [d.platform, d.author]).sort()).toEqual([['instagram', 'agent'], ['x', 'agent']]);
    for (const d of drafts) expect(d.parts[0].media[0]).toMatchObject({ kind: 'image', assetId: mediaId, variant: 'square' });
    const again = await (await send('POST', `/v1/assistant/chats/${chatId}/options/${firstOptionId}/use`)).json();
    expect(again).toEqual({ ideaId, draftIds: [] });
    const chat = await (await send('GET', `/v1/assistant/chats/${chatId}`)).json();
    expect(chat.messages[1].options[0].ideaId).toBe(ideaId);
    expect((await send('POST', `/v1/assistant/chats/${chatId}/options/nope/use`)).status).toBe(404);
  });

  it('greets without drafting, lists and deletes chats', async () => {
    const chat = await (await send('POST', `/v1/brands/${brandId}/assistant/chats`, { message: 'hello' })).json();
    expect(chat.title).toBe('New chat');
    expect(chat.messages[1].options).toBeUndefined();
    expect(chat.platforms).toEqual(['instagram', 'linkedin']);
    const list = (await (await send('GET', `/v1/assistant/chats?brandId=${brandId}`)).json()).data;
    expect(list.map((c: { id: string }) => c.id)).toEqual([chat.id, chatId]);
    expect((await send('DELETE', `/v1/assistant/chats/${chat.id}`)).status).toBe(204);
    expect((await send('GET', `/v1/assistant/chats/${chat.id}`)).status).toBe(404);
  });

  it('validates input', async () => {
    expect((await send('POST', `/v1/brands/${brandId}/assistant/chats`, { message: '' })).status).toBe(400);
    expect((await send('POST', `/v1/brands/${brandId}/assistant/chats`, { message: 'x', platforms: ['tiktok'] })).status).toBe(400);
  });
});

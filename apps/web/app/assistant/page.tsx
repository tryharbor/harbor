import Link from 'next/link';
import type { Platform } from '@harbor/core';
import { deleteAssistantChat, sendAssistantMessage, startAssistantChat } from '../actions';
import { getBrands, getChat, getChannels, getChats, loadAll, type BrandView, type Chat, type ChatSummary } from '../api';
import { BrandFilter } from '../components/brand-filter';
import { OptionCard } from '../components/option-card';
import { SubmitButton } from '../components/submit-button';
import { PlatformIcon } from '../platform-icon';
import { Flash, LoadError, PLATFORM_NAME, PageHeader, SimTag, when } from '../ui';

export const dynamic = 'force-dynamic';

const PLATFORMS: Platform[] = ['instagram', 'linkedin', 'x', 'threads'];
const REFINE = [
  { label: 'Shorter', message: 'shorter' },
  { label: 'Punchier', message: 'punchier' },
  { label: 'More specific', message: 'more specific' },
  { label: 'Other hooks', message: 'other hooks' },
  { label: 'Different angles', message: 'different angles' },
];

/** Starter prompts that fit the kind of business, so a first-time owner never faces an empty box. */
function suggestions(brand: BrandView): string[] {
  const b = brand.memory.business;
  const product = brand.memory.products[0]?.name;
  const base = ['Why we started', 'Behind the scenes this week'];
  switch (b.type) {
    case 'service': return ['A tip our customers always ask about', 'A job we finished this week', ...base];
    case 'software': return [product ? `A feature in ${product} people miss` : 'A feature people miss', 'What we shipped this week', ...base];
    case 'creator': return ['One lesson from my work', 'What I’m making next', ...base];
    case 'ecommerce':
    case 'product': return [product ? `Why people love ${product}` : 'Why people love what we make', 'Something new in the shop', ...base];
    default: return [product ? `What's new with ${product}` : "Something new we're launching", 'A tip for our customers', ...base];
  }
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ brand?: string; chat?: string; notice?: string; error?: string }> }) {
  const s = await searchParams;
  const brandsRes = await loadAll<[BrandView[]]>([getBrands()]);
  if (!brandsRes.ok) return <LoadError message={brandsRes.error} />;
  const [brands] = brandsRes.data;
  const businesses = brands.filter((b) => b.kind === 'brand');
  const brand = brands.find((b) => b.id === s.brand) ?? businesses[0] ?? brands[0];
  if (!brand) {
    return (
      <>
        <PageHeader title="Assistant" sub="Tell it what you want to post about and pick from three on-brand options." />
        <div className="empty"><span>Add a business first, so the assistant knows whose voice and colours to use.</span><Link className="button primary" href="/brands/new">Add a business</Link></div>
      </>
    );
  }
  const res = await loadAll<[ChatSummary[], Chat | undefined, { platform: Platform; status: string }[]]>([
    getChats(brand.id),
    s.chat ? getChat(s.chat) : Promise.resolve(undefined),
    getChannels(brand.id),
  ]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [chats, chat, channels] = res.data;
  const connected = new Set(channels.filter((c) => c.status === 'connected').map((c) => c.platform));
  const defaults = connected.size ? PLATFORMS.filter((p) => connected.has(p)).slice(0, 3) : (['instagram', 'linkedin'] as Platform[]);
  const hrefs = Object.fromEntries(brands.map((b) => [b.id, `/assistant?brand=${b.id}`]));
  const lastOptions = chat ? [...chat.messages].reverse().find((m) => m.options?.length) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Assistant"
        title={chat ? chat.title : 'What do you want to post about?'}
        sub={chat ? `${brand.name} · ${chat.platforms.map((p) => PLATFORM_NAME[p]).join(', ')}` : `Say it in your own words. You get three options in ${brand.name}'s voice and colours, and nothing posts until you approve it.`}
        actions={<BrandFilter brands={brands} current={brand.id} hrefs={hrefs} allHref={`/assistant?brand=${brand.id}`} width={220} />}
      />
      <Flash params={s} />
      <div className="assistant-layout">
        <nav className="assistant-chats" aria-label="Chats">
          <Link className="button" href={`/assistant?brand=${brand.id}`}>New chat</Link>
          {chats.length ? (
            <ul className="list">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/assistant?brand=${brand.id}&chat=${c.id}`} className="nav-link" aria-current={c.id === chat?.id ? 'page' : undefined}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <span className="small dim">Your chats show up here.</span>}
        </nav>

        <div className="assistant-main">
          {chat ? (
            <>
              <ol className="chat-thread">
                {chat.messages.map((m) => (
                  <li key={m.id} className={`chat-msg ${m.role}`}>
                    {m.role === 'user' ? <p className="chat-bubble">{m.text}</p> : (
                      <div className="stack">
                        <div className="row" style={{ gap: 8 }}>
                          <p className="chat-reply">{m.text}</p>
                        </div>
                        {m.options?.length ? (
                          <div className="option-grid">
                            {m.options.map((o) => <OptionCard key={o.id} option={o} chatId={chat.id} brandId={brand.id} designSrc={`/assistant/design/${chat.id}/${o.id}?v=${encodeURIComponent(brand.updatedAt)}`} />)}
                          </div>
                        ) : null}
                        <span className="small dim row" style={{ gap: 6 }}>{when(m.at, { hour: 'numeric', minute: '2-digit' })}{m.model ? <SimTag model={m.model} /> : null}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <div className="composer card">
                {lastOptions ? (
                  <div className="row" style={{ gap: 6 }}>
                    {REFINE.map((r) => (
                      <form key={r.label} action={sendAssistantMessage}>
                        <input type="hidden" name="chatId" value={chat.id} />
                        <input type="hidden" name="brandId" value={brand.id} />
                        <input type="hidden" name="message" value={r.message} />
                        <SubmitButton className="mono-button" pending="Rewriting…">{r.label}</SubmitButton>
                      </form>
                    ))}
                  </div>
                ) : null}
                <form action={sendAssistantMessage} className="composer-form">
                  <input type="hidden" name="chatId" value={chat.id} />
                  <input type="hidden" name="brandId" value={brand.id} />
                  <textarea name="message" required maxLength={2000} placeholder="Ask for changes, or a new topic: “our Saturday market stall”" aria-label="Message" />
                  <SubmitButton className="primary" pending="Writing…">Send</SubmitButton>
                </form>
              </div>
              <form action={deleteAssistantChat} style={{ justifySelf: 'start' }}>
                <input type="hidden" name="chatId" value={chat.id} />
                <input type="hidden" name="brandId" value={brand.id} />
                <button type="submit" className="link-button small">Delete this chat</button>
              </form>
            </>
          ) : (
            <div className="stack-lg">
              <form action={startAssistantChat} className="composer card">
                <input type="hidden" name="brandId" value={brand.id} />
                <div className="composer-form">
                  <textarea name="message" required maxLength={2000} placeholder="e.g. our new seasonal roast, a tip for first-time customers, why we started" aria-label="What do you want to post about?" autoFocus />
                  <SubmitButton className="primary" pending="Writing three options…">Write options</SubmitButton>
                </div>
                <fieldset className="row" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
                  <legend className="label" style={{ marginBottom: 6 }}>Write for</legend>
                  {PLATFORMS.map((p) => (
                    <label key={p} className="channel-pick">
                      <input type="checkbox" name="platforms" value={p} defaultChecked={defaults.includes(p)} />
                      <PlatformIcon platform={p} size={13} />{PLATFORM_NAME[p]}
                    </label>
                  ))}
                </fieldset>
              </form>
              <div className="stack" style={{ gap: 8 }}>
                <span className="label">Or start from one of these</span>
                <div className="row" style={{ gap: 8 }}>
                  {suggestions(brand).map((t) => (
                    <form key={t} action={startAssistantChat}>
                      <input type="hidden" name="brandId" value={brand.id} />
                      <input type="hidden" name="message" value={t} />
                      {defaults.map((p) => <input key={p} type="hidden" name="platforms" value={p} />)}
                      <SubmitButton pending="Writing…">{t}</SubmitButton>
                    </form>
                  ))}
                </div>
              </div>
              {!brand.memory.branding.colors.length ? (
                <p className="notice small">Designs use Harbor’s colours until you add yours. <Link href={`/brands/${brand.id}/memory?section=branding`}>Set up branding</Link></p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

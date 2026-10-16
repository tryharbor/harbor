import type { Channel } from '@harbor/core';
import { disconnectChannel } from '../../../actions';
import { API_PUBLIC_URL, getChannels, getPlatforms, loadAll, type PlatformInfo } from '../../../api';
import { Flash, LoadError, PLATFORM_NAME, PlatformTag, when } from '../../../ui';

export const dynamic = 'force-dynamic';

const NOTES: Record<string, string> = {
  x: 'Text and images. Pay-per-use API: keep a spending limit on in the X developer console.',
  linkedin: 'Posts as you. Tokens last 60 days, then reconnect. No metrics without partner access.',
  instagram: 'Professional (Business or Creator) account. Every post needs an image or video.',
  threads: 'Text, images, video and threaded replies.',
};

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const { id } = await params;
  const flash = await searchParams;
  const res = await loadAll<[Channel[], PlatformInfo[]]>([getChannels(id), getPlatforms()]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [channels, platforms] = res.data;
  const connectUrl = (platform: string) => `${API_PUBLIC_URL}/v1/channels/${platform}/connect?brandId=${id}`;

  return (
    <>
      <Flash params={flash} />
      <div className="grid">
        {platforms.map((p) => {
          const mine = channels.filter((c) => c.platform === p.platform);
          return (
            <section key={p.platform} className="stack">
              <h2>{PLATFORM_NAME[p.platform]}</h2>
              <p className="muted small">{NOTES[p.platform]}</p>
              {mine.map((c) => (
                <div key={c.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span className="row"><PlatformTag platform={c.platform} handle={c.account.handle} /> <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span>
                  {c.tokenExpiresAt ? <span className="muted small">Access until {when(c.tokenExpiresAt, { dateStyle: 'medium' })}</span> : null}
                  <div className="row">
                    {c.status !== 'connected' ? <a className="button primary" href={connectUrl(p.platform)}>Reconnect</a> : null}
                    <form action={disconnectChannel}>
                      <input type="hidden" name="brandId" value={id} />
                      <input type="hidden" name="channelId" value={c.id} />
                      <button type="submit">Disconnect</button>
                    </form>
                  </div>
                </div>
              ))}
              <div><a className={`button${mine.length ? '' : ' primary'}`} href={connectUrl(p.platform)}>{mine.length ? 'Connect another' : `Connect ${PLATFORM_NAME[p.platform]}`}</a></div>
            </section>
          );
        })}
      </div>
      <p className="muted small">Connecting opens the platform's own sign-in page. Your app keys come from <code>.env</code>; see <code>docs/setup/platform-apps.md</code>.</p>
    </>
  );
}

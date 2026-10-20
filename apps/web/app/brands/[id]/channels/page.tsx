import type { Channel } from '@harbor/core';
import { disconnectChannel } from '../../../actions';
import { getChannels, getMode, getPlatforms, loadAll, type Mode, type PlatformInfo } from '../../../api';
import { ImportPosts } from '../../../components/import-posts';
import { SandboxConnect } from '../../../components/sandbox-connect';
import { Flash, LoadError, PLATFORM_NAME, PlatformTag, when } from '../../../ui';
import { PlatformIcon } from '../../../platform-icon';

export const dynamic = 'force-dynamic';

const NOTES: Record<string, string> = {
  x: 'Text and images. Pay-per-use API: keep a spending limit on in the X developer console.',
  linkedin: 'Posts as you. Tokens last 60 days, then reconnect. No metrics without partner access.',
  instagram: 'Professional (Business or Creator) account. Every post needs an image or video.',
  threads: 'Text, images, video and threaded replies.',
};

export default async function ChannelsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string; sandbox?: string }> }) {
  const { id } = await params;
  const s = await searchParams;
  const res = await loadAll<[Channel[], PlatformInfo[], Mode]>([getChannels(id), getPlatforms(), getMode()]);
  if (!res.ok) return <LoadError message={res.error} />;
  const [channels, platforms, mode] = res.data;
  const sandbox = mode.publish === 'sandbox';
  const connectUrl = (platform: string) => `/connect/${platform}?${new URLSearchParams({ brandId: id })}`;

  return (
    <>
      <Flash params={s} />
      {sandbox ? (
        <div className="grid-2">
          <p className="muted small" style={{ alignSelf: 'center' }}>
            <span className="tag" style={{ marginRight: 8 }}>Sandbox</span>
            Practice accounts: posts are recorded and measured with simulated numbers, never sent to a platform. Switch to live in <code>.env</code> (<code>HARBOR_PUBLISH_MODE=live</code>) once your developer apps are set up.
          </p>
          <SandboxConnect brandId={id} returnTo={`/brands/${id}/channels`} preselect={s.sandbox} />
        </div>
      ) : null}
      <div className="grid">
        {platforms.map((p) => {
          const mine = channels.filter((c) => c.platform === p.platform);
          return (
            <section key={p.platform} className="stack">
              <div className="spread">
                <h2 style={{ margin: 0, display: 'flex', gap: 10, alignItems: 'center' }}><PlatformIcon platform={p.platform} size={18} />{PLATFORM_NAME[p.platform]}</h2>
                {!p.reportsMetrics ? <span className="tag">No metrics</span> : null}
              </div>
              <p className="muted small">{NOTES[p.platform]}</p>
              {mine.map((c) => (
                <div key={c.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, gap: 8 }}>
                  <span className="row"><PlatformTag platform={c.platform} handle={c.account.handle} /> <span className={`pill s-${c.status}`}>{c.status.replace('_', ' ')}</span></span>
                  {c.tokenExpiresAt ? <span className="dim small">Access until {when(c.tokenExpiresAt, { dateStyle: 'medium' })}</span> : null}
                  {c.status === 'connected' ? <ImportPosts channelId={c.id} brandId={id} supported={sandbox || p.platform === 'instagram' || p.platform === 'threads' || (p.platform === 'x' && !!p.reportsReplies)} /> : null}
                  <div className="row">
                    {/* Connected accounts can sign in again too (to review what Harbor can access); their posts and stats stay. */}
                    {!sandbox ? <a className={`button${c.status !== 'connected' ? ' primary' : ''}`} href={connectUrl(p.platform)} title={`Sign in to ${p.name} again and review what Harbor can access. This account's posts and stats stay in Harbor.`}>Reconnect</a> : null}
                    <form action={disconnectChannel}>
                      <input type="hidden" name="brandId" value={id} />
                      <input type="hidden" name="channelId" value={c.id} />
                      <button type="submit">Disconnect</button>
                    </form>
                  </div>
                </div>
              ))}
              {mine.length === 0 ? <div className="empty" style={{ padding: 16 }}><span className="dim small">Not connected</span></div> : null}
              {!sandbox ? <div><a className={`button${mine.length ? '' : ' primary'}`} href={connectUrl(p.platform)}>{mine.length ? 'Connect another' : `Connect ${PLATFORM_NAME[p.platform]}`}</a></div> : null}
            </section>
          );
        })}
      </div>
      {!sandbox ? <p className="dim small">Connecting opens the platform's own sign-in page. App keys come from <code>.env</code>; see <code>docs/setup/platform-apps.md</code>.</p> : null}
    </>
  );
}

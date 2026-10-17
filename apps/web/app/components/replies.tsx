import Link from 'next/link';
import { refreshReplies } from '../learn-actions';
import type { ReplyKind, ReplyView, Theme } from '../api';
import { SaveToMemory } from './save-to-memory';
import { TZ } from '../ui';

export const REPLY_KIND: Record<ReplyKind, string> = { question: 'Questions', objection: 'Objections', praise: 'Praise', request: 'Requests', other: 'Other' };
const MARK: Record<ReplyKind, string> = { question: '?', objection: '!', praise: '+', request: '→', other: '·' };

export function KindMark({ kind }: { kind: ReplyKind }) {
  return <span className={`reply-mark k-${kind}`} aria-hidden="true">{MARK[kind]}</span>;
}

/** Replies on one post: themes first (what people keep saying), then every reply, each savable to Brand Memory. */
export function Replies({ brandId, postId, replies, themes, supported, platformName, returnTo }: { brandId: string; postId: string; replies: ReplyView[]; themes: Theme[]; supported: boolean; platformName: string; returnTo: string }) {
  return (
    <section className="stack">
      <div className="spread">
        <h2 style={{ margin: 0 }}>Replies{replies.length ? ` · ${replies.length}` : ''}</h2>
        {supported ? (
          <form action={refreshReplies}>
            <input type="hidden" name="postId" value={postId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit">Fetch replies</button>
          </form>
        ) : null}
      </div>
      {!supported ? (
        <p className="small muted" style={{ margin: 0 }}>Harbor can’t read replies on {platformName} yet{platformName === 'X' ? ': X bills every read, so it’s off unless HARBOR_X_READ_REPLIES=true' : ': LinkedIn restricts its comments API'}.</p>
      ) : replies.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>No replies yet. Harbor reads them at 24 hours and again at 3 days.</p>
      ) : (
        <>
          {themes.length ? (
            <div className="themes">
              {themes.map((t) => (
                <div key={t.id} className="theme">
                  <span className="row small" style={{ gap: 6 }}><KindMark kind={t.kind} /><span className="label">{REPLY_KIND[t.kind]}</span><span className="dim mono" title="Replies on this post · across all of the brand's posts">{replies.filter((r) => r.themeId === t.id).length} here · {t.count} overall</span></span>
                  <strong style={{ fontWeight: 500 }}>{t.label}</strong>
                  <SaveToMemory brandId={brandId} kind="theme" id={t.id} options={['knowledge', 'do', 'avoid']} defaultText={`${t.label}\n\n${t.sample.map((r) => `“${r.text}”`).join('\n')}`} compact />
                </div>
              ))}
            </div>
          ) : null}
          <ul className="replies">
            {replies.map((r) => (
              <li key={r.id}>
                <KindMark kind={r.kind} />
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <span className="small"><strong style={{ fontWeight: 500 }}>{r.author.displayName ?? r.author.handle}</strong> <span className="dim">@{r.author.handle} · {new Date(r.createdAt).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}{r.likes ? ` · ${r.likes} likes` : ''}</span></span>
                  <p style={{ margin: 0 }}>{r.text}</p>
                </div>
                <SaveToMemory brandId={brandId} kind="reply" id={r.id} options={['knowledge', 'avoid', 'do']} defaultText={r.text} compact />
              </li>
            ))}
          </ul>
          <Link href={`/insights?brand=${brandId}#conversation`} className="small">What people say across every post →</Link>
        </>
      )}
    </section>
  );
}

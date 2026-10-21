import Link from 'next/link';
import { deleteReply, hideReply, refreshReplies, respondToReply } from '../learn-actions';
import type { ReplyActions, ReplyKind, ReplyView, Theme } from '../api';
import { SaveToMemory } from './save-to-memory';
import { Flash, TZ } from '../ui';

export const REPLY_KIND: Record<ReplyKind, string> = { question: 'Questions', objection: 'Objections', praise: 'Praise', request: 'Requests', other: 'Other' };
const MARK: Record<ReplyKind, string> = { question: '?', objection: '!', praise: '+', request: '→', other: '·' };

export function KindMark({ kind }: { kind: ReplyKind }) {
  return <span className={`reply-mark k-${kind}`} aria-hidden="true">{MARK[kind]}</span>;
}

const NONE: ReplyActions = { respond: false, hide: false, remove: false };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });

/**
 * Reply, Hide and Delete for one comment, where the platform allows them (Instagram). Plain forms: Reply and Delete
 * open in place, and Delete asks for a second click before anything changes on the platform.
 */
function ReplyControls({ r, postId, returnTo, actions, accountHandle, platformName }: { r: ReplyView; postId: string; returnTo: string; actions: ReplyActions; accountHandle: string; platformName: string }) {
  const Hidden = () => (<><input type="hidden" name="replyId" value={r.id} /><input type="hidden" name="postId" value={postId} /><input type="hidden" name="returnTo" value={returnTo} /></>);
  return (
    <div className="reply-actions">
      {actions.respond ? (
        <details className="reply-action">
          <summary className="button mono-button" title={`Write a reply that Harbor posts under this comment on ${platformName}, as @${accountHandle}.`}>Reply</summary>
          <form action={respondToReply} className="stack" style={{ gap: 6 }}>
            <Hidden />
            <label className="sr-only" htmlFor={`answer-${r.id}`}>Reply to @{r.author.handle}</label>
            <textarea id={`answer-${r.id}`} name="text" required maxLength={2200} placeholder={`Reply to @${r.author.handle}`} style={{ minHeight: 72 }} />
            <span className="row" style={{ gap: 8 }}>
              <button type="submit" className="primary">Post reply</button>
              <span className="dim small">Posts under this comment on {platformName} as @{accountHandle}.</span>
            </span>
          </form>
        </details>
      ) : null}
      {actions.hide ? (
        <form action={hideReply}>
          <Hidden />
          <input type="hidden" name="hidden" value={r.hidden ? 'false' : 'true'} />
          <button type="submit" className="mono-button" title={r.hidden ? `Show this comment on ${platformName} again.` : `Hide this comment on ${platformName}. Everyone except the person who wrote it stops seeing it. You can show it again later.`}>{r.hidden ? 'Unhide' : 'Hide'}</button>
        </form>
      ) : null}
      {actions.remove ? (
        <details className="reply-action">
          <summary className="button mono-button" title={`Delete this comment from ${platformName}.`}>Delete</summary>
          <form action={deleteReply} className="stack" style={{ gap: 6 }}>
            <Hidden />
            <span className="small">Delete @{r.author.handle}’s comment “{r.text.length > 80 ? `${r.text.slice(0, 80)}…` : r.text}” from {platformName}? This can’t be undone.</span>
            <span><button type="submit" className="danger">Delete comment</button></span>
          </form>
        </details>
      ) : null}
    </div>
  );
}

/** Replies on one post: themes first (what people keep saying), then every reply, each savable to Brand Memory and, where the platform allows, answerable, hideable and deletable. */
export function Replies({ brandId, postId, replies, themes, supported, actions = NONE, accountHandle, platformName, returnTo, flash = {} }: { brandId: string; postId: string; replies: ReplyView[]; themes: Theme[]; supported: boolean; actions?: ReplyActions; accountHandle: string; platformName: string; returnTo: string; flash?: { notice?: string; error?: string; at?: string } }) {
  const manage = actions.respond || actions.hide || actions.remove;
  return (
    <section className="stack" id="replies">
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
      <Flash params={flash} />
      {!supported ? (
        <p className="small muted" style={{ margin: 0 }}>Harbor can’t read replies on {platformName} yet{platformName === 'X' ? ': X bills every read, so it’s off unless HARBOR_X_READ_REPLIES=true' : ': LinkedIn restricts its comments API'}.</p>
      ) : null}
      {supported && manage && replies.length ? (
        <p className="small muted" style={{ margin: 0 }}>Reply to, hide or delete a comment here, and Harbor makes the change on {platformName} as @{accountHandle}.</p>
      ) : null}
      {!supported ? null : replies.length === 0 ? (
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
          {/* Keyed by the last action, so every open Reply box and Delete confirmation closes once something changes. */}
          <ul className="replies" key={flash.at ?? 'list'}>
            {replies.map((r) => (
              <li key={r.id} className={r.hidden ? 'is-hidden' : undefined}>
                <KindMark kind={r.kind} />
                <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                  <span className="small"><strong style={{ fontWeight: 500 }}>{r.author.displayName ?? r.author.handle}</strong> <span className="dim">@{r.author.handle} · {day(r.createdAt)}{r.likes ? ` · ${r.likes} likes` : ''}</span>{r.hidden ? <span className="chip" title={`Hidden on ${platformName}: only the person who wrote it still sees it.`}>Hidden on {platformName}</span> : null}</span>
                  <p style={{ margin: 0 }}>{r.text}</p>
                  {r.answers?.map((a) => (
                    <p key={a.platformReplyId} className="reply-answer small"><span className="dim">@{accountHandle} replied · {day(a.at)}</span><br />{a.text}</p>
                  ))}
                  {manage ? <ReplyControls r={r} postId={postId} returnTo={returnTo} actions={actions} accountHandle={accountHandle} platformName={platformName} /> : null}
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

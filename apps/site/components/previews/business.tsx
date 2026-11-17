import { PlatformIcon } from '../platform-icon';

/**
 * One business at a glance, the way Harbor shows it: its website, this week's post options, and the money coming in.
 * Illustrative (the Tidewater Coffee demo business), not a real customer's numbers.
 */
const POSTS = [
  { text: 'The beans in your next bag were still green on Monday.', picked: true },
  { text: 'Three ways to brew our Colombia this weekend.', picked: false },
  { text: 'What “roasted to order” actually means.', picked: false },
];
const BARS = [38, 52, 44, 61, 58, 72, 80];

export function BusinessPreview() {
  return (
    <div className="biz">
      <div className="a-card biz-site">
        <div className="biz-head"><span className="a-label">Website</span><span className="a-pill good">Live</span></div>
        <div className="biz-page">
          <div className="biz-page-bar">Tidewater Coffee</div>
          <div className="biz-page-body">
            <strong>Coffee worth waiting two weeks for.</strong>
            <span>Small-batch, roasted to order.</span>
            <span className="biz-page-btn">Start a subscription</span>
          </div>
        </div>
      </div>

      <div className="a-card biz-posts">
        <div className="biz-head"><span className="a-label">This week’s posts</span><PlatformIcon platform="instagram" size={12} /></div>
        {POSTS.map((p) => (
          <div key={p.text} className={`biz-post${p.picked ? ' picked' : ''}`}>
            <span>{p.text}</span>
            {p.picked ? <span className="a-pill sched">Picked</span> : null}
          </div>
        ))}
      </div>

      <div className="a-card biz-money">
        <div className="biz-head"><span className="a-label">Money · November</span></div>
        <strong className="biz-total">$1,856</strong>
        <span className="up">↑ 18% on October</span>
        <div className="biz-bars" aria-hidden="true">
          {BARS.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}
        </div>
        <span className="biz-foot">58 subscriptions · 4 new this week</span>
      </div>
    </div>
  );
}

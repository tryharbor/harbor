import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '../../../lib/site';
import { LegalPage } from '../legal-page';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/privacy', {
  title: 'Privacy',
  description: 'What Harbor stores and where: this website, self-hosted Harbor on your own server, and Harbor Cloud. Includes how Harbor uses data from Instagram, Threads, X and LinkedIn, and how to delete it.',
  alternates: { canonical: '/privacy' },
});

const SECTIONS = [
  { id: 'short', title: 'The short version' },
  { id: 'website', title: 'This website' },
  { id: 'self-hosted', title: 'Self-hosted Harbor' },
  { id: 'cloud', title: 'Harbor Cloud' },
  { id: 'platforms', title: 'Data from the platforms' },
  { id: 'delete', title: 'Deleting your data' },
  { id: 'sharing', title: 'Who we share data with' },
  { id: 'rights', title: 'Your rights' },
  { id: 'changes', title: 'Changes and contact' },
];

const STORED = [
  { what: 'Brands and Brand Memory', detail: 'Names, logos, voice rules, audiences, offers, knowledge notes, example posts, and the evidence linking rules to posts.' },
  { what: 'Connected accounts', detail: 'For each account: the platform’s account id, handle, display name, profile picture URL, the permissions granted and the access tokens. Tokens are encrypted with AES-256-GCM using your HARBOR_SECRET_KEY.' },
  { what: 'Content', detail: 'Ideas, drafts and every draft version, posts, campaigns and canvas cards, approvals and their notes.' },
  { what: 'Performance', detail: 'Metric snapshots for each post at 1h, 6h, 24h, 3d and 7d, the platform’s raw response next to the normalized numbers, verdicts, signals, insights and digests.' },
  { what: 'Replies', detail: 'Where the platform allows it: replies to your posts, with the replier’s handle, display name, text, time and likes, and the themes Harbor groups them into.' },
  { what: 'Imported posts', detail: 'Past posts you choose to import from a connected account, with their metrics.' },
  { what: 'Competitors', detail: 'Names, URLs, handles and notes you add yourself.' },
  { what: 'Media', detail: 'Images and video you upload, with alt text, tags and focal point, stored on disk under HARBOR_MEDIA_DIR. Their crops are served at public, unguessable URLs so platforms can download them.' },
  { what: 'Agents and keys', detail: 'Agent runs with their inputs, steps and token usage, automations, and API keys (only a SHA-256 hash and the first 12 characters of each key).' },
];

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy" updated="2026-10-18" sections={SECTIONS}>
      <h2 id="short">The short version</h2>
      <ul>
        <li><strong>This website</strong> has no analytics, no tracking and no cookies of ours.</li>
        <li><strong>Self-hosted Harbor</strong> stores everything in your own database, on your own server. It sends nothing to us. Ever.</li>
        <li><strong>Harbor Cloud</strong> is in early access, by invitation. It stores the same kinds of data on infrastructure we run, uses it only to run Harbor for you, and never sells it or uses it to train AI models.</li>
        <li>Harbor never posts without a person approving it, on either version.</li>
      </ul>
      <p>“Harbor”, “we” and “us” below mean Harbor Labs LLC, the company that builds and runs Harbor. You can reach us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>

      <h2 id="website">This website</h2>
      <p>useharbor.io is a static site. We don’t run analytics, advertising pixels or third-party trackers on it, and we don’t set cookies. Fonts are served from this site, not from a font provider.</p>
      <p>Our hosting provider keeps standard server logs (IP address, browser, the page requested and the time) to deliver the site and protect it from abuse. We don’t combine those logs with anything else.</p>
      <p>If you email us, for example to ask for early access, we keep your email address and message to reply to you and to tell you when your invitation is ready. Ask us to delete it at any time.</p>

      <h2 id="self-hosted">Self-hosted Harbor</h2>
      <p>When you run Harbor yourself, <strong>you</strong> are the one storing and processing data, on infrastructure you control. Harbor has no telemetry: it doesn’t phone home, report usage or send anything to us.</p>
      <h3>What it stores, in your database</h3>
      <table className="legal-table">
        <thead><tr><th scope="col">What</th><th scope="col">Details</th></tr></thead>
        <tbody>{STORED.map((r) => <tr key={r.what}><td>{r.what}</td><td>{r.detail}</td></tr>)}</tbody>
      </table>
      <p>The database is Postgres if you set <code>DATABASE_URL</code>, or an embedded PGlite database in <code>apps/api/.pglite</code> if you don’t.</p>
      <h3>Where data goes</h3>
      <ul>
        <li><strong>In sandbox mode</strong> (the default), nowhere. Platforms are simulated and nothing leaves your machine.</li>
        <li><strong>In live mode</strong>, to the platforms you connect (X, LinkedIn, Instagram, Threads), through developer apps you registered: Harbor sends them the posts you approve and reads back metrics and, where you’ve allowed it, replies.</li>
        <li><strong>If you turn on a real AI model</strong>, the brand context and briefs needed for each request go to that model provider under your own API key and their terms. The default simulated model runs locally and sends nothing.</li>
      </ul>
      <p>If you run Harbor for other people, such as clients, you’re responsible for telling them how you handle their data. Replies to posts contain other people’s public handles and words; treat them with care.</p>

      <h2 id="cloud">Harbor Cloud</h2>
      <p>Harbor Cloud is the version we run for you, at app.useharbor.io. It’s in early access: people sign in by invitation while we finish each platform’s app review.</p>
      <ul>
        <li><strong>Your sign-in:</strong> you sign in with GitHub. We read only your GitHub username, to check you’re invited, and keep it in a signed cookie that keeps you signed in. We don’t receive your GitHub password, email address or repositories.</li>
        <li><strong>Everything self-hosted Harbor stores</strong> (the table above), on infrastructure we run (see <a href="#sharing">who we share data with</a>), with access tokens encrypted at rest (AES-256-GCM) and backups.</li>
        <li><strong>Operational logs:</strong> requests and errors, kept for a short time to run and debug the service.</li>
        <li><strong>Billing, when paid plans start:</strong> handled by a payment processor we’ll name here first. We’ll see your billing name, country and the last four digits of your card, never the full card number. Early access is free.</li>
      </ul>
      <p>We use this data only to provide Harbor to you: publishing what you approve, measuring how it did, and drafting and planning from it. We don’t sell it, we don’t use it for advertising, and we don’t use your content or platform data to train AI models.</p>

      <h2 id="platforms">Data from the platforms</h2>
      <p>When you connect an account, the platform shows you exactly which permissions Harbor asks for. Here is what each one is used for.</p>
      <h3>Instagram and Threads (Meta)</h3>
      <ul>
        <li><strong>Basic profile</strong> (account id, username, name, picture): to show which account a post goes to.</li>
        <li><strong>Content publishing:</strong> to publish posts, carousels, Reels and threads you have approved. Never anything you haven’t.</li>
        <li><strong>Insights:</strong> to read each post’s metrics five times over its first week and compare it with your other posts.</li>
        <li><strong>Comments and replies:</strong> to read replies to your posts and group them into themes; on Threads, also to post the replies that make up a thread you wrote.</li>
      </ul>
      <h3>X</h3>
      <p>Your account’s basic profile, posting (including images), and reading your own posts’ metrics. Reading replies and importing past posts is off unless the person running Harbor turns it on.</p>
      <h3>LinkedIn</h3>
      <p>Your basic profile through Sign In with LinkedIn, and posting to your own profile. Harbor doesn’t read LinkedIn metrics or comments.</p>
      <p>Harbor uses platform data only for these purposes and only for the account that connected it. It isn’t shared across workspaces, sold, used for advertising, used to train AI models, or used for anything else.</p>
      <p><strong>How long we keep it:</strong> data from a connected account is kept only while it’s connected. Disconnecting the account, deleting the brand, removing Harbor on the platform, or asking us to delete your data removes it, as described under <a href="#delete">Deleting your data</a>.</p>

      <h2 id="delete">Deleting your data</h2>
      <ul>
        <li><strong>Disconnect an account</strong> in Harbor (on the brand’s page): the account record and its access token are deleted, along with the posts Harbor stored for it.</li>
        <li><strong>Remove Harbor from Instagram or Threads, or ask for deletion there:</strong> in Instagram, go to Settings → Apps and websites (under Website permissions); in Threads, Settings → Account → Website permissions. Remove Harbor and, if offered, send a request to delete your data. When Meta tells us you removed Harbor or asked for deletion, we immediately delete every account record connected to that Instagram or Threads account, its access tokens, and the posts, metrics and replies Harbor stored for it. A deletion request gives you a confirmation code and a link where you can check its status. Backups that contain the data are overwritten within 30 days.</li>
        <li><strong>Remove Harbor from X or LinkedIn:</strong> revoke Harbor in your connected apps. Harbor can no longer use the token; disconnect the account in Harbor, or email us, to delete what it stored.</li>
        <li><strong>Delete a brand</strong> in Harbor: its Brand Memory, accounts, posts, metrics and replies are deleted with it.</li>
        <li><strong>Self-hosted:</strong> you control the database and the media folder, and can delete anything in them directly. Removing an image in the library hides it first; delete the file from <code>HARBOR_MEDIA_DIR</code> to remove it from disk.</li>
        <li><strong>Harbor Cloud, or anything you sent us:</strong> email <a href={`mailto:${SITE.email}?subject=Delete%20my%20data`}>{SITE.email}</a> with the subject “Delete my data”. We’ll confirm, and delete it within 30 days, including from backups as they rotate.</li>
      </ul>

      <h2 id="sharing">Who we share data with</h2>
      <p>We share data only with the service providers below, which process it for us to run Harbor, and with the platforms you connect, to do what you ask.</p>
      <table className="legal-table">
        <thead><tr><th scope="col">Provider</th><th scope="col">What it does for Harbor</th></tr></thead>
        <tbody>
          <tr><td>Vercel</td><td>Hosts this website and the Harbor Cloud web app.</td></tr>
          <tr><td>Railway</td><td>Runs the Harbor Cloud API and background worker, and hosts its Postgres database and uploaded media.</td></tr>
          <tr><td>GitHub</td><td>Sign-in to Harbor Cloud. GitHub tells us your username; it receives nothing from Harbor.</td></tr>
          <tr><td>X, LinkedIn, Instagram and Threads</td><td>Only the accounts you connect: they receive the posts you approve and send back the profile, metrics and replies described above.</td></tr>
        </tbody>
      </table>
      <p>Harbor Cloud doesn’t use an AI model provider yet: drafting runs on Harbor’s own built-in model, so your content doesn’t leave our infrastructure for it. If that changes, we’ll name the provider here first and say whether it can train on your data. We don’t use marketing email, analytics or advertising providers. We share data with authorities only when the law requires it.</p>

      <h2 id="rights">Your rights</h2>
      <p>Wherever you live, you can ask us what we hold about you, ask for a copy, ask us to correct it, or ask us to delete it. Email us and we’ll answer within 30 days. If you’re in the EU or UK, you can also complain to your data protection authority.</p>
      <p>Harbor isn’t meant for children under 16.</p>

      <h2 id="changes">Changes and contact</h2>
      <p>When we change this policy, we’ll update the date at the top, and for material changes we’ll tell Harbor Cloud users before they take effect. See also the <Link href="/terms">terms</Link>.</p>
      <p>Questions or requests: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
    </LegalPage>
  );
}

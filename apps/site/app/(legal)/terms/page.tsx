import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE } from '../../../lib/site';
import { LegalPage } from '../legal-page';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/terms', {
  title: 'Terms',
  description: 'Plain-language terms for the Harbor website, the open-source software and Harbor Cloud.',
  alternates: { canonical: '/terms' },
});

const SECTIONS = [
  { id: 'short', title: 'The short version' },
  { id: 'software', title: 'The open-source software' },
  { id: 'website', title: 'This website' },
  { id: 'cloud', title: 'Harbor Cloud' },
  { id: 'content', title: 'Your content' },
  { id: 'use', title: 'Acceptable use' },
  { id: 'platforms', title: 'The platforms' },
  { id: 'payment', title: 'Plans and payment' },
  { id: 'ending', title: 'Ending things' },
  { id: 'liability', title: 'Warranty and liability' },
  { id: 'changes', title: 'Changes and contact' },
];

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms" updated="2026-10-18" sections={SECTIONS}>
      <h2 id="short">The short version</h2>
      <ul>
        <li>The Harbor software is open source under the AGPL-3.0. These terms don’t change that license.</li>
        <li>Your content is yours. On Harbor Cloud we only use it to run Harbor for you.</li>
        <li>You decide what gets posted, and you’re responsible for it. Harbor never posts without your approval.</li>
        <li>Follow the rules of each platform you post to.</li>
      </ul>
      <p>“Harbor”, “we” and “us” mean Harbor Labs LLC, the company that builds and runs Harbor, reachable at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>. “You” means you, or the organization you use Harbor for.</p>

      <h2 id="software">The open-source software</h2>
      <p>The Harbor source code is licensed under the <a href={`${SITE.github}/blob/main/LICENSE`}>GNU Affero General Public License v3.0</a>. When you self-host Harbor, that license is the agreement between us; nothing on this page adds to it or takes away from it. In short: you can use, change and share Harbor, and if you let others use a modified version over a network, you must offer them its source. The <Link href="/open-source">open-source page</Link> explains this in plain words.</p>
      <p>When you self-host, you run your own instance: you’re responsible for your server, your keys, your platform developer apps, your backups and your compliance with each platform’s terms.</p>

      <h2 id="website">This website</h2>
      <p>You can read, link to and share anything on useharbor.io. The Harbor name, mark and pixel logo are ours; please don’t use them in a way that suggests we endorse you or your product. A fork of Harbor should use its own name.</p>

      <h2 id="cloud">Harbor Cloud</h2>
      <p>Harbor Cloud isn’t open yet. These parts of the terms describe how it will work, and apply once you create a Cloud account.</p>
      <ul>
        <li>You need to give us a working email address and keep your sign-in details safe. You’re responsible for what happens in your account.</li>
        <li>We’ll work to keep Cloud running and your data backed up, but we can’t promise it will never be unavailable. Planned maintenance will be announced ahead of time where we can.</li>
        <li>Features may change as Harbor develops. If we remove something you pay for, we’ll tell you first.</li>
      </ul>

      <h2 id="content">Your content</h2>
      <p>You own what you put into Harbor and what Harbor drafts for you: Brand Memory, ideas, drafts, posts, media and notes. On Cloud, you give us permission to store, process and send that content only as needed to run Harbor for you, for example to draft in your voice, publish what you approve and measure how it did. That permission ends when you delete the content or your account, apart from backups that rotate out.</p>
      <p>You’re responsible for having the right to use what you upload and publish, including images, and for checking drafts before you approve them. AI drafts can be wrong; Harbor shows you every post before it goes out for exactly that reason.</p>

      <h2 id="use">Acceptable use</h2>
      <p>Don’t use Harbor to:</p>
      <ul>
        <li>post spam, mislead people, or pretend to be a person or organization you’re not;</li>
        <li>post for accounts you aren’t authorized to manage;</li>
        <li>harass anyone, or post anything illegal;</li>
        <li>break a platform’s rules, including its rules on automation;</li>
        <li>attack, overload or probe Harbor Cloud, or get around its plan limits.</li>
      </ul>
      <p>If an account on Cloud breaks these rules, we may suspend it. Where we can, we’ll tell you why first and give you a chance to fix it.</p>

      <h2 id="platforms">The platforms</h2>
      <p>Harbor publishes to X, LinkedIn, Instagram and Threads through their APIs. Those companies aren’t part of Harbor, and their own terms apply to your accounts. They can change their APIs, prices or rules, limit what Harbor can do, or revoke access, and that can affect Harbor without notice. X bills API use per post and per read; if you self-host, those charges are between you and X.</p>

      <h2 id="payment">Plans and payment</h2>
      <p>Self-hosting is free. Cloud plans are priced per brand and billed monthly in advance, as shown on the <Link href="/pricing">pricing page</Link>. Current prices are early pricing and may change before Cloud opens; after you subscribe, we’ll give you at least 30 days’ notice of any price change. You can cancel any time, and your plan runs to the end of the period you’ve paid for. Plans include usage limits, such as AI runs and X reads, that are listed with each plan.</p>

      <h2 id="ending">Ending things</h2>
      <p>You can stop using Harbor and delete your Cloud account at any time. Before you do, you can export your data. We may close a Cloud account that seriously or repeatedly breaks these terms, or if we stop offering Cloud; in that case we’ll give you notice and time to export, unless the law or an emergency prevents it. Because Harbor is open source, you can always keep running it yourself.</p>

      <h2 id="liability">Warranty and liability</h2>
      <p>Harbor is provided as is. The open-source software comes with no warranty, as the AGPL says. For Cloud, to the extent the law allows, we aren’t liable for indirect losses, such as lost followers, revenue or opportunities, or for what platforms do with your accounts. Our total liability for Cloud is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have that the law says can’t be limited.</p>

      <h2 id="changes">Changes and contact</h2>
      <p>This is a draft and will change before Cloud opens. When we change these terms, we’ll update the date at the top, and tell Cloud users by email at least 30 days before a material change takes effect. See also the <Link href="/privacy">privacy policy</Link>.</p>
      <p>Questions: <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.</p>
    </LegalPage>
  );
}

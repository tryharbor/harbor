import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { Footer } from '../components/footer';
import { Header } from '../components/header';
import { SITE } from '../lib/site';
import { JsonLd, organization, website } from '../lib/jsonld';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `Harbor: ${SITE.tagline}`, template: '%s · Harbor' },
  description: SITE.description,
  openGraph: { type: 'website', siteName: 'Harbor', title: `Harbor: ${SITE.tagline}`, description: SITE.description, url: SITE.url },
  twitter: { card: 'summary_large_image', site: '@tryharbor', title: `Harbor: ${SITE.tagline}`, description: SITE.description },
  alternates: { canonical: '/', types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Harbor blog' }] } },
  verification: {
    // Set in Vercel once Search Console / Bing Webmaster give a token (the DNS TXT method needs neither).
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

export const viewport: Viewport = { themeColor: '#0a0a0a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <a href="#main" className="btn sm" style={{ position: 'absolute', left: -9999 }}>Skip to content</a>
        <JsonLd data={[organization, website]} />
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

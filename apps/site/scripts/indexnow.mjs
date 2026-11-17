// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing's index also feeds ChatGPT search) that pages
// changed, so new and updated guides are picked up within hours. Run after each production deploy:
//   pnpm --filter @harbor/site indexnow            (every URL in the live sitemap)
//   pnpm --filter @harbor/site indexnow /guides/x  (just these paths)
// The key is public by design: it's served at /<key>.txt to prove the pings come from this site.
const KEY = 'a3ce93a3490aa0d8b2721bd34be76c09';
const HOST = 'useharbor.io';
const ORIGIN = `https://${HOST}`;

const paths = process.argv.slice(2);
let urls = paths.map((p) => new URL(p, ORIGIN).href);
if (!urls.length) {
  const xml = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
const keyFile = await fetch(`${ORIGIN}/${KEY}.txt`);
if (!keyFile.ok || (await keyFile.text()).trim() !== KEY) {
  console.error(`The key file ${ORIGIN}/${KEY}.txt isn't live yet. Deploy first, then run this.`);
  process.exit(1);
}
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `${ORIGIN}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
if (res.status >= 400) process.exit(1);

import type { Brand } from '@harbor/core';
import { markOn, palette, readableOn } from '../services/design-render.ts';
import type { Workspace } from './workspace.ts';

/**
 * The starting files for a new Full app project: a small static web app (no build step) in the business's colours,
 * so the first preview already looks like the brand. Phase 3's starter adds sign-in, a database and payments.
 */
export async function writeStarter(ws: Workspace, brand: Brand, projectName: string): Promise<void> {
  const p = palette(brand);
  const name = brand.name.replace(/\s*\(demo\)$/, '');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const head = brand.memory.branding.fonts.heading;
  const button = markOn('#ffffff', p.primary, p.accent, '#111111');
  await ws.write('index.html', `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(projectName)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="top">
    <strong>${esc(name)}</strong>
    <span class="muted">${esc(projectName)}</span>
  </header>
  <main>
    <section class="hero">
      <h1>${esc(projectName)}</h1>
      <p class="muted">${esc(brand.memory.business.oneLiner || 'Describe what this app should do, and Harbor builds it here.')}</p>
      <button class="btn" type="button" id="hello">Try it</button>
      <p id="out" class="muted"></p>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`);
  await ws.write('styles.css', `:root {
  --brand: ${p.primary};
  --on-brand: ${readableOn(p.primary)};
  --accent: ${p.accent};
  --button: ${button};
  --on-button: ${readableOn(button)};
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.6 ${head ? `'${head.replace(/'/g, '')}', ` : ''}Inter, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #18181a; background: #fafafa; }
.top { display: flex; gap: 12px; align-items: baseline; padding: 16px 24px; background: var(--brand); color: var(--on-brand); }
main { max-width: 880px; margin: 0 auto; padding: 32px 24px; display: grid; gap: 16px; }
.hero h1 { font-size: clamp(32px, 6vw, 52px); line-height: 1.1; margin: 0 0 8px; letter-spacing: -0.02em; }
.muted { color: #666; }
.top .muted { color: inherit; opacity: 0.8; }
.card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04); }
.btn { font: inherit; font-weight: 600; padding: 10px 18px; border: 0; border-radius: 999px; background: var(--button); color: var(--on-button); cursor: pointer; }
`);
  await ws.write('app.js', `// The app's behaviour. Harbor's builder adds to this as you ask for features.
document.getElementById('hello')?.addEventListener('click', () => {
  document.getElementById('out').textContent = 'It works. Ask Harbor for the first feature.';
});
`);
  await ws.write('README.md', `# ${projectName}\n\nBuilt with Harbor for ${name}. Open index.html, or ask Harbor for changes.\n`);
}

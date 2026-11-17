import { z } from 'zod';
import type { App, AppDeps } from '../app.ts';
import { body, check } from '../lib/http.ts';
import { loadBrand } from '../services/brands.ts';
import {
  createProject, deleteProject, history, listProjects, listRuns, loadProject, restore, startBuild, stopBuild, updateProject, workspaceFor,
} from '../services/projects.ts';

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  ico: 'image/x-icon', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', woff2: 'font/woff2',
};

/**
 * Full app projects. The static preview serves the project's own files with a sandbox CSP: the page can run its scripts
 * and forms but gets a unique origin, so AI-written code can never read Harbor's cookies or pages.
 */
export function registerProjects(app: App, deps: AppDeps) {
  const { db } = deps;

  app.get('/v1/brands/:id/projects', async (c) => c.json({ data: await listProjects(db, (await loadBrand(db, c.req.param('id'))).id) }));

  app.post('/v1/brands/:id/projects', async (c) => {
    const input = await body(c, z.object({ name: z.string().trim().min(1).max(80) }).strict());
    return c.json(await createProject(deps, await loadBrand(db, c.req.param('id')), input), 201);
  });

  /** The project, its runs (oldest first) and whether code can run on this server. */
  app.get('/v1/projects/:id', async (c) => {
    const project = await loadProject(db, c.req.param('id'));
    const [runs, available] = await Promise.all([listRuns(db, project.id), deps.sandboxes.available().catch(() => false)]);
    return c.json({ project, runs, sandbox: { kind: deps.sandboxes.kind, available } });
  });

  app.patch('/v1/projects/:id', async (c) => {
    const input = await body(c, z.object({ name: z.string().trim().min(1).max(80).optional(), budgetCents: z.number().int().min(50).max(10_000).optional() }).strict());
    return c.json(await updateProject(db, (await loadProject(db, c.req.param('id'))).id, input));
  });

  app.delete('/v1/projects/:id', async (c) => {
    await deleteProject(deps, c.req.param('id'));
    return c.body(null, 204);
  });

  /** Ask the builder for something. Returns at once (202); the run records its steps as it works. */
  app.post('/v1/projects/:id/builds', async (c) => {
    const input = await body(c, z.object({ request: z.string().trim().min(1).max(4000) }).strict());
    const { run } = await startBuild(deps, await loadProject(db, c.req.param('id')), input.request);
    return c.json(run, 202);
  });

  app.post('/v1/builds/:id/stop', async (c) => c.json(await stopBuild(db, c.req.param('id'))));

  app.get('/v1/projects/:id/files', async (c) => c.json({ data: await (await workspaceFor(deps, (await loadProject(db, c.req.param('id'))).id)).list() }));

  app.get('/v1/projects/:id/file', async (c) => {
    const ws = await workspaceFor(deps, (await loadProject(db, c.req.param('id'))).id);
    const path = check(z.string().min(1).max(500), c.req.query('path'));
    return c.json({ path, content: await ws.read(path) });
  });

  app.get('/v1/projects/:id/history', async (c) => c.json({ data: await history(deps, (await loadProject(db, c.req.param('id'))).id) }));

  app.post('/v1/projects/:id/restore', async (c) => {
    const input = await body(c, z.object({ sha: z.string().regex(/^[0-9a-f]{7,40}$/) }).strict());
    return c.json(await restore(deps, await loadProject(db, c.req.param('id')), input.sha));
  });

  app.get('/v1/projects/:id/preview/*', async (c) => {
    const project = await loadProject(db, c.req.param('id'));
    const rest = decodeURIComponent(c.req.path.split('/preview/')[1] ?? '') || 'index.html';
    const ws = await workspaceFor(deps, project.id);
    const bytes = await ws.readBytes(rest.endsWith('/') ? `${rest}index.html` : rest);
    const ext = rest.split('.').pop()?.toLowerCase() ?? '';
    return c.body(new Uint8Array(bytes), 200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'content-security-policy': 'sandbox allow-scripts allow-forms allow-modals',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    });
  });
}

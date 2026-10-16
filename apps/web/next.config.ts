import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// One .env at the repo root serves both apps. Next only reads its own folder, so load the root file too
// (variables already set in the environment win).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@harbor/core'],
  // `next build` also writes .next/standalone (a minimal server.js plus only the files it needs) for apps/web/Dockerfile.
  // `next dev` ignores it. Tracing starts at the repo root so the workspace packages come along.
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default config;

import { migrate, openDb } from '../db/client.ts';

// `pnpm --filter @harbor/api db:migrate` (uses DATABASE_URL, or the local PGlite dir when unset)
const db = await openDb(process.env.DATABASE_URL, { migrate: false });
const applied = await migrate(db);
await db.close();
console.log(applied.length ? `Applied ${applied.join(', ')}.` : 'Schema is up to date.');

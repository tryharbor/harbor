// The app's database: SQLite, built into Node (no packages). It lives in data/, which stays on the app's server:
// Harbor never copies customers' data into the project's files or history.
// To store something new, add a CREATE TABLE IF NOT EXISTS below and query it with db.prepare(...).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const path = process.env.DATABASE_PATH || 'data/app.db';
mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT,
    stripe_customer TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`);

/**
 * Run once to create all database tables.
 * Usage: node scripts/init-db.js
 *
 * Requires DATABASE_URL in environment (or .env file loaded externally).
 */

import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const schema = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS drafts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content      TEXT        NOT NULL,
  input        TEXT        NOT NULL,
  audience     TEXT,
  status       TEXT        NOT NULL DEFAULT 'draft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  review_note  TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id       UUID        NOT NULL REFERENCES drafts(id),
  scheduled_time TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  retry_count    INT         NOT NULL DEFAULT 0,
  max_retries    INT         NOT NULL DEFAULT 3,
  next_retry_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_results (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_post_id   UUID        NOT NULL REFERENCES scheduled_posts(id),
  twitter_id          TEXT,
  status              TEXT        NOT NULL,
  error               TEXT,
  http_status         INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drafts_status            ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status   ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due      ON scheduled_posts(scheduled_time) WHERE status = 'pending';
`;

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await client.connect();

  console.log('Creating tables...');
  await client.query(schema);

  console.log('Done. Tables created (or already exist):');
  console.log('  - drafts');
  console.log('  - scheduled_posts');
  console.log('  - post_results');

  await client.end();
}

run().catch(err => {
  console.error('Init failed:', err.message);
  process.exit(1);
});

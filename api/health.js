import { db } from '../lib/db.js';

const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY',
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET',
  'DATABASE_URL',
  'CRON_SECRET'
];

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const missing = REQUIRED_ENV.filter(k => !process.env[k]);
  const configOk = missing.length === 0;

  let dbOk = false;
  try {
    dbOk = await db.healthCheck();
  } catch {
    dbOk = false;
  }

  const status = configOk && dbOk ? 'ok' : 'degraded';

  console.log(`[health] status=${status} db=${dbOk} config=${configOk}`);

  return res.status(status === 'ok' ? 200 : 503).json({
    status,
    db: dbOk,
    config: configOk,
    ...(missing.length > 0 && { missing_vars: missing })
  });
}

import { db } from '../../lib/db.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const VALID_STATUSES = ['draft', 'approved', 'rejected', 'scheduled', 'posted'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { status } = req.query ?? {};

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const result = status
      ? await db.query('SELECT * FROM drafts WHERE status = $1 ORDER BY created_at DESC', [status])
      : await db.query('SELECT * FROM drafts ORDER BY created_at DESC');

    return res.status(200).json({ drafts: result.rows });
  } catch (err) {
    console.error(`[drafts/list] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch drafts' });
  }
}

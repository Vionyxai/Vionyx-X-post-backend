import { db } from '../../lib/db.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

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

  if (status && !['success', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'status must be success or failed' });
  }

  try {
    const baseQuery = `
      SELECT
        pr.id,
        pr.status,
        pr.twitter_id,
        pr.error,
        pr.http_status,
        pr.created_at as posted_at,
        d.content as draft_content,
        d.audience,
        sp.scheduled_time,
        sp.retry_count
      FROM post_results pr
      JOIN scheduled_posts sp ON sp.id = pr.scheduled_post_id
      JOIN drafts d ON d.id = sp.draft_id
      ${status ? 'WHERE pr.status = $1' : ''}
      ORDER BY pr.created_at DESC
    `;

    const result = status
      ? await db.query(baseQuery, [status])
      : await db.query(baseQuery);

    return res.status(200).json({ results: result.rows });
  } catch (err) {
    console.error(`[results/list] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch results' });
  }
}

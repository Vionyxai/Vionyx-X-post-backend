import { db } from '../../../lib/db.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const { note } = req.body ?? {};

  if (note !== undefined && typeof note !== 'string') {
    return res.status(400).json({ error: 'note must be a string' });
  }

  try {
    const result = await db.query(
      `UPDATE drafts
       SET status = 'rejected', reviewed_at = NOW(), review_note = $2
       WHERE id = $1 AND status IN ('draft', 'approved')
       RETURNING *`,
      [id, note?.trim() || null]
    );

    if (result.rows.length === 0) {
      const exists = await db.query('SELECT id, status FROM drafts WHERE id = $1', [id]);
      if (exists.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
      return res.status(409).json({ error: `Cannot reject draft with status: ${exists.rows[0].status}` });
    }

    console.log(`[drafts/reject] Rejected | id=${id}`);
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`[drafts/reject] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to reject draft' });
  }
}

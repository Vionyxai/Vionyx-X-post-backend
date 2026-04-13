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

  try {
    const result = await db.query(
      `UPDATE drafts
       SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1 AND status = 'draft'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      // Check if it exists at all
      const exists = await db.query('SELECT id, status FROM drafts WHERE id = $1', [id]);
      if (exists.rows.length === 0) return res.status(404).json({ error: 'Draft not found' });
      return res.status(409).json({ error: `Cannot approve draft with status: ${exists.rows[0].status}` });
    }

    console.log(`[drafts/approve] Approved | id=${id}`);
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`[drafts/approve] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to approve draft' });
  }
}

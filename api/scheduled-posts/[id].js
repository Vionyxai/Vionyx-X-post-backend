import { db } from '../../lib/db.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'DELETE') return handleCancel(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req, res) {
  const { id } = req.query;

  try {
    const result = await db.query(
      `SELECT sp.*, d.content as draft_content, d.audience, d.input as draft_input
       FROM scheduled_posts sp
       JOIN drafts d ON d.id = sp.draft_id
       WHERE sp.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(`[scheduled-posts/get] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch scheduled post' });
  }
}

async function handleCancel(req, res) {
  const { id } = req.query;

  try {
    await db.transaction(async (client) => {
      const spResult = await client.query(
        `UPDATE scheduled_posts
         SET status = 'cancelled'
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [id]
      );

      if (spResult.rows.length === 0) {
        const exists = await client.query('SELECT id, status FROM scheduled_posts WHERE id = $1', [id]);
        if (exists.rows.length === 0) {
          const err = new Error('Scheduled post not found');
          err.status = 404;
          throw err;
        }
        const err = new Error(`Cannot cancel post with status: ${exists.rows[0].status}`);
        err.status = 409;
        throw err;
      }

      // Reset draft back to approved so it can be rescheduled
      await client.query(
        `UPDATE drafts SET status = 'approved' WHERE id = $1`,
        [spResult.rows[0].draft_id]
      );

      console.log(`[scheduled-posts/cancel] Cancelled | id=${id}`);
      return spResult.rows[0];
    }).then(row => {
      return res.status(200).json({ ...row, message: 'Post cancelled. Draft reset to approved.' });
    });

  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 409) return res.status(409).json({ error: err.message });
    console.error(`[scheduled-posts/cancel] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to cancel scheduled post' });
  }
}

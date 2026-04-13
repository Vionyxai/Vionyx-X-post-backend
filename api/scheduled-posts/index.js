import { db } from '../../lib/db.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const VALID_STATUSES = ['pending', 'processing', 'posted', 'failed', 'cancelled'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') return handleCreate(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleList(req, res) {
  const { status } = req.query ?? {};

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const result = status
      ? await db.query(
          `SELECT sp.*, d.content as draft_content, d.audience
           FROM scheduled_posts sp
           JOIN drafts d ON d.id = sp.draft_id
           WHERE sp.status = $1
           ORDER BY sp.scheduled_time ASC`,
          [status]
        )
      : await db.query(
          `SELECT sp.*, d.content as draft_content, d.audience
           FROM scheduled_posts sp
           JOIN drafts d ON d.id = sp.draft_id
           ORDER BY sp.scheduled_time ASC`
        );

    return res.status(200).json({ scheduled_posts: result.rows });
  } catch (err) {
    console.error(`[scheduled-posts/list] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to fetch scheduled posts' });
  }
}

async function handleCreate(req, res) {
  const { draft_id, scheduled_time } = req.body ?? {};

  if (!draft_id || typeof draft_id !== 'string') {
    return res.status(400).json({ error: 'draft_id is required' });
  }
  if (!scheduled_time || typeof scheduled_time !== 'string') {
    return res.status(400).json({ error: 'scheduled_time is required (ISO 8601 string)' });
  }

  const scheduledDate = new Date(scheduled_time);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: 'scheduled_time must be a valid ISO 8601 date string' });
  }

  try {
    await db.transaction(async (client) => {
      // Verify draft exists and is approved
      const draftResult = await client.query(
        'SELECT id, status FROM drafts WHERE id = $1',
        [draft_id]
      );

      if (draftResult.rows.length === 0) {
        const err = new Error('Draft not found');
        err.status = 404;
        throw err;
      }

      const draft = draftResult.rows[0];
      if (draft.status !== 'approved') {
        const err = new Error(`Draft must be approved before scheduling. Current status: ${draft.status}`);
        err.status = 409;
        throw err;
      }

      // Create scheduled post
      const spResult = await client.query(
        `INSERT INTO scheduled_posts (draft_id, scheduled_time, status)
         VALUES ($1, $2, 'pending')
         RETURNING *`,
        [draft_id, scheduledDate.toISOString()]
      );

      // Update draft status
      await client.query(
        `UPDATE drafts SET status = 'scheduled' WHERE id = $1`,
        [draft_id]
      );

      const row = spResult.rows[0];
      console.log(`[scheduled-posts/create] Scheduled | id=${row.id} time=${row.scheduled_time}`);

      return row;
    }).then(row => {
      return res.status(201).json(row);
    });

  } catch (err) {
    if (err.status === 404) return res.status(404).json({ error: err.message });
    if (err.status === 409) return res.status(409).json({ error: err.message });
    console.error(`[scheduled-posts/create] DB error | ${err.message}`);
    return res.status(500).json({ error: 'Failed to schedule post' });
  }
}

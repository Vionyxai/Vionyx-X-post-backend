import { db } from '../../lib/db.js';
import { encode, nonce, sign, buildAuthHeader } from '../../lib/oauth.js';

const CRON_SECRET = process.env.CRON_SECRET;
const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

// Exponential backoff intervals (minutes)
const BACKOFF_MINUTES = [5, 15, 45];

function nextRetryAt(retryCount) {
  const minutes = BACKOFF_MINUTES[retryCount] ?? 45;
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function postTweet(text) {
  const url = 'https://api.twitter.com/2/tweets';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthNonce = nonce();

  const oauthParams = {
    oauth_consumer_key: TWITTER_API_KEY,
    oauth_nonce: oauthNonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0'
  };

  oauthParams.oauth_signature = sign(
    'POST', url, oauthParams, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN_SECRET
  );

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(oauthParams),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Twitter response parse failed (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const detail = data?.detail || data?.errors?.[0]?.message || 'Unknown Twitter error';
    const err = new Error(detail);
    err.httpStatus = response.status;
    throw err;
  }

  return { twitterId: data?.data?.id, httpStatus: response.status };
}

export default async function handler(req, res) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers['authorization'];
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_TOKEN_SECRET) {
    console.error('[cron/process-queue] Twitter credentials not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Claim all due pending posts atomically
    const dueResult = await db.query(
      `UPDATE scheduled_posts
       SET status = 'processing'
       WHERE id IN (
         SELECT id FROM scheduled_posts
         WHERE status = 'pending'
           AND scheduled_time <= NOW()
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, draft_id, retry_count, max_retries`
    );

    const duePosts = dueResult.rows;
    console.log(`[cron/process-queue] Found ${duePosts.length} post(s) due`);

    for (const post of duePosts) {
      processed++;

      // Load draft content
      const draftResult = await db.query('SELECT content FROM drafts WHERE id = $1', [post.draft_id]);
      const content = draftResult.rows[0]?.content;

      if (!content) {
        console.error(`[cron/process-queue] Draft content missing | sp_id=${post.id}`);
        await db.query(
          `UPDATE scheduled_posts SET status = 'failed' WHERE id = $1`,
          [post.id]
        );
        await db.query(
          `INSERT INTO post_results (scheduled_post_id, status, error)
           VALUES ($1, 'failed', 'Draft content not found')`,
          [post.id]
        );
        failed++;
        continue;
      }

      try {
        const { twitterId, httpStatus } = await postTweet(content);

        await db.transaction(async (client) => {
          await client.query(
            `UPDATE scheduled_posts SET status = 'posted' WHERE id = $1`,
            [post.id]
          );
          await client.query(
            `UPDATE drafts SET status = 'posted' WHERE id = $1`,
            [post.draft_id]
          );
          await client.query(
            `INSERT INTO post_results (scheduled_post_id, twitter_id, status, http_status)
             VALUES ($1, $2, 'success', $3)`,
            [post.id, twitterId, httpStatus]
          );
        });

        console.log(`[cron/process-queue] Posted | sp_id=${post.id} twitter_id=${twitterId}`);
        succeeded++;

      } catch (err) {
        const newRetryCount = post.retry_count + 1;
        const exhausted = newRetryCount >= post.max_retries;

        await db.transaction(async (client) => {
          if (exhausted) {
            await client.query(
              `UPDATE scheduled_posts SET status = 'failed', retry_count = $2 WHERE id = $1`,
              [post.id, newRetryCount]
            );
            // Reset draft to 'draft' so user can review and reschedule
            await client.query(
              `UPDATE drafts SET status = 'draft' WHERE id = $1`,
              [post.draft_id]
            );
          } else {
            await client.query(
              `UPDATE scheduled_posts
               SET status = 'pending', retry_count = $2, next_retry_at = $3
               WHERE id = $1`,
              [post.id, newRetryCount, nextRetryAt(newRetryCount - 1)]
            );
          }

          await client.query(
            `INSERT INTO post_results (scheduled_post_id, status, error, http_status)
             VALUES ($1, 'failed', $2, $3)`,
            [post.id, err.message, err.httpStatus ?? null]
          );
        });

        console.error(`[cron/process-queue] Failed | sp_id=${post.id} retry=${newRetryCount}/${post.max_retries} error=${err.message}`);
        failed++;
      }
    }

    return res.status(200).json({ processed, succeeded, failed });

  } catch (err) {
    console.error(`[cron/process-queue] Unexpected error | ${err.message}`);
    return res.status(500).json({ error: 'Queue processing failed', processed, succeeded, failed });
  }
}

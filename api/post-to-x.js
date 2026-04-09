import { encode, nonce, sign, buildAuthHeader } from '../lib/oauth.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const TWITTER_API_KEY = process.env.TWITTER_API_KEY;
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
const TWITTER_ACCESS_TOKEN_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function credentialsConfigured() {
  return TWITTER_API_KEY && TWITTER_API_SECRET && TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_TOKEN_SECRET;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!credentialsConfigured()) {
    console.error('[post-to-x] Twitter credentials not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const { text } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }
  if (text.length > 280) {
    return res.status(400).json({ error: 'text exceeds 280 characters' });
  }

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
    'POST',
    url,
    oauthParams,
    TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN_SECRET
  );

  const authHeader = buildAuthHeader(oauthParams);

  console.log(`[post-to-x] Posting tweet | length=${text.length}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      console.error('[post-to-x] Failed to parse Twitter response');
      return res.status(502).json({ error: 'Upstream response parse failed' });
    }

    if (!response.ok) {
      console.error(`[post-to-x] Twitter API error | status=${response.status}`);
      return res.status(response.status).json({
        error: 'Post failed',
        detail: data?.detail || data?.errors?.[0]?.message || 'Unknown error'
      });
    }

    console.log(`[post-to-x] Tweet posted | id=${data?.data?.id}`);
    return res.status(200).json({ success: true, id: data?.data?.id });

  } catch (err) {
    console.error(`[post-to-x] Unexpected error | ${err.message}`);
    return res.status(500).json({ error: 'Post failed' });
  }
}

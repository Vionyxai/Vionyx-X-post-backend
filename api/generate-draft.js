const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_INPUT_LENGTH = 1000;

const SYSTEM_PROMPT = `You are VIONYX — a precision content system. Your voice is calm, direct, slightly detached. Never motivational fluff. Never cheerleading. Never therapy cliches.

You write posts for X (Twitter) that mirror ideas back with compression and clarity. The post should feel like a grounded operator speaking — not a hype account.

Rules:
- Maximum 260 characters
- No hashtags
- No emojis unless they serve the point exactly
- Do not start with "I"
- Compress the signal — cut what does not earn its place
- End with either a declarative statement or a single sharp question. Never both.
- Output only the post text. Nothing else.`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_API_KEY) {
    console.error('[generate-draft] ANTHROPIC_API_KEY not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const { input, audience } = req.body ?? {};

  if (typeof input !== 'string' || !input.trim()) {
    return res.status(400).json({ error: 'input is required and must be a non-empty string' });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ error: `input must be ${MAX_INPUT_LENGTH} characters or fewer` });
  }
  if (audience !== undefined && typeof audience !== 'string') {
    return res.status(400).json({ error: 'audience must be a string' });
  }

  const userPrompt = `Mirror this into a VIONYX post for X:\n\n"${input.trim()}"\n\nAudience emphasis: ${(audience || 'general').trim()}\n\nDraft the post now.`;

  console.log(`[generate-draft] Generating draft | input_length=${input.length}`);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      console.error('[generate-draft] Failed to parse Anthropic response');
      return res.status(502).json({ error: 'Upstream response parse failed' });
    }

    if (!response.ok) {
      console.error(`[generate-draft] Anthropic error | status=${response.status}`);
      return res.status(502).json({ error: 'Draft generation failed' });
    }

    const draft = data?.content?.[0]?.text?.trim();
    if (!draft) {
      console.error('[generate-draft] Empty draft returned from Anthropic');
      return res.status(502).json({ error: 'Empty response from model' });
    }

    console.log(`[generate-draft] Draft generated | length=${draft.length}`);
    return res.status(200).json({ draft });

  } catch (err) {
    console.error(`[generate-draft] Unexpected error | ${err.message}`);
    return res.status(500).json({ error: 'Draft generation failed' });
  }
}

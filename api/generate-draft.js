export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { input, audience } = req.body;

  if (!input) return res.status(400).json({ error: 'Input required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const systemPrompt = `You are VIONYX — a precision content system. Your voice is calm, direct, slightly detached. Never motivational fluff. Never cheerleading. Never therapy cliches.

You write posts for X (Twitter) that mirror ideas back with compression and clarity. The post should feel like a grounded operator speaking — not a hype account.

Rules:
- Maximum 260 characters
- No hashtags
- No emojis unless they serve the point exactly
- Do not start with "I"
- Compress the signal — cut what does not earn its place
- End with either a declarative statement or a single sharp question. Never both.
- Output only the post text. Nothing else.`;

  const userPrompt = `Mirror this into a VIONYX post for X:

"${input}"

Audience emphasis: ${audience}

Draft the post now.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });

    const draft = data.content[0].text.trim();
    return res.status(200).json({ draft });

  } catch (err) {
    return res.status(500).json({ error: 'Draft failed', detail: err.message });
  }
}

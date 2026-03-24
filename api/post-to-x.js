import crypto from ‘crypto’;

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
const sortedParams = Object.keys(params)
.sort()
.map(k => `${encode(k)}=${encode(params[k])}`)
.join(’&’);

const baseString = [
method.toUpperCase(),
encode(url),
encode(sortedParams)
].join(’&’);

const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;

return crypto
.createHmac(‘sha1’, signingKey)
.update(baseString)
.digest(‘base64’);
}

function encode(str) {
return encodeURIComponent(String(str))
.replace(/!/g, ‘%21’)
.replace(/’/g, ‘%27’)
.replace(/(/g, ‘%28’)
.replace(/)/g, ‘%29’)
.replace(/*/g, ‘%2A’);
}

function nonce() {
return crypto.randomBytes(16).toString(‘hex’);
}

export default async function handler(req, res) {
// CORS
res.setHeader(‘Access-Control-Allow-Origin’, ‘*’);
res.setHeader(‘Access-Control-Allow-Methods’, ‘POST, OPTIONS’);
res.setHeader(‘Access-Control-Allow-Headers’, ‘Content-Type’);

if (req.method === ‘OPTIONS’) return res.status(200).end();
if (req.method !== ‘POST’) return res.status(405).json({ error: ‘Method not allowed’ });

const { text, api_key, api_secret, access_token, access_token_secret } = req.body;

if (!text || !api_key || !api_secret || !access_token || !access_token_secret) {
return res.status(400).json({ error: ‘Missing required fields’ });
}

if (text.length > 280) {
return res.status(400).json({ error: ‘Post exceeds 280 characters’ });
}

const url = ‘https://api.twitter.com/2/tweets’;
const timestamp = Math.floor(Date.now() / 1000).toString();
const oauthNonce = nonce();

const oauthParams = {
oauth_consumer_key: api_key,
oauth_nonce: oauthNonce,
oauth_signature_method: ‘HMAC-SHA1’,
oauth_timestamp: timestamp,
oauth_token: access_token,
oauth_version: ‘1.0’
};

const signature = oauthSign(‘POST’, url, oauthParams, api_secret, access_token_secret);
oauthParams.oauth_signature = signature;

const authHeader = ‘OAuth ’ + Object.keys(oauthParams)
.sort()
.map(k => `${encode(k)}="${encode(oauthParams[k])}"`)
.join(’, ’);

try {
const response = await fetch(url, {
method: ‘POST’,
headers: {
‘Authorization’: authHeader,
‘Content-Type’: ‘application/json’
},
body: JSON.stringify({ text })
});

```
const data = await response.json();

if (!response.ok) {
  return res.status(response.status).json({ error: data });
}

return res.status(200).json({ success: true, data });
```

} catch (err) {
return res.status(500).json({ error: ‘Post failed’, detail: err.message });
}
}


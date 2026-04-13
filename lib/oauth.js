import crypto from 'crypto';

export function encode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

export function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

export function sign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${encode(k)}=${encode(params[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(sortedParams)
  ].join('&');

  const signingKey = `${encode(consumerSecret)}&${encode(tokenSecret)}`;

  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');
}

export function buildAuthHeader(oauthParams) {
  return 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map(k => `${encode(k)}="${encode(oauthParams[k])}"`)
    .join(', ');
}

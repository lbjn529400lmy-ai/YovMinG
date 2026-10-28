const ALLOWED_URL_HOST = /^(?:[a-z0-9-]+\.)?supabase\.co$/i;

function isPublicKey(value) {
  const key = String(value || '').trim();
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  if (/^(?:sb_secret_|service_role|secret)/i.test(key)) return false;

  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const urlValue = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:' || !ALLOWED_URL_HOST.test(url.hostname) || !isPublicKey(key)) {
      throw new Error('Invalid public Supabase configuration');
    }

    return res.status(200).json({ url: url.origin, anonKey: key });
  } catch {
    return res.status(503).json({ error: 'Supabase public configuration is unavailable' });
  }
};

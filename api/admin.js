/* ============================================================
   JOYBRINGERS ADMIN — Vercel Serverless API
   /api/admin.js

   Handles:
     - Login  (verifies email + password against env vars)
     - Session tokens  (HMAC-signed, 8-hour expiry)
     - GitHub API proxy  (token never leaves the server)

   Required Vercel Environment Variables:
     ADMIN_EMAIL      e.g. admin@joybringerscharity.org
     ADMIN_PASSWORD   plain text password (stored encrypted by Vercel)
     GITHUB_TOKEN     Personal Access Token with "repo" scope
     SESSION_SECRET   any long random string
   ============================================================ */

const crypto = require('crypto');

const GITHUB_OWNER  = 'Beau34-max';
const GITHUB_REPO   = 'joybringerswebsitesep';
const GITHUB_BRANCH = 'main';
const SESSION_TTL   = 8 * 60 * 60 * 1000; // 8 hours

/* ── helpers ─────────────────────────────────────────────── */

function sha256hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function makeSession(email) {
  const secret  = process.env.SESSION_SECRET || 'change-me-please';
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + SESSION_TTL }))
                        .toString('base64');
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function checkSession(token) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const secret  = process.env.SESSION_SECRET || 'change-me-please';
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // constant-time compare
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
  } catch { return null; }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    return Date.now() < data.exp ? data : null;
  } catch { return null; }
}

function ghHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

const ghBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/* ── main handler ────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const { action } = body;

  /* ── LOGIN ─────────────────────────────────────────────── */
  if (action === 'login') {
    const adminEmail    = process.env.ADMIN_EMAIL    || '';
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    const githubToken   = process.env.GITHUB_TOKEN   || '';

    if (!adminEmail || !adminPassword || !githubToken) {
      return res.status(503).json({
        error: 'Admin not configured yet. Please set ADMIN_EMAIL, ADMIN_PASSWORD, GITHUB_TOKEN, and SESSION_SECRET in your Vercel Environment Variables, then redeploy.'
      });
    }

    const { password } = body;

    // Plain comparison — password sent over HTTPS, no need for client-side hash
    if (!password || password !== adminPassword) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    return res.status(200).json({ token: makeSession(adminEmail) });
  }

  /* ── ALL OTHER ACTIONS REQUIRE A VALID SESSION ─────────── */
  const authHeader   = req.headers['authorization'] || '';
  const sessionToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!checkSession(sessionToken)) {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }

  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ error: 'GITHUB_TOKEN not set in environment variables.' });
  }

  /* ── READ A FILE ───────────────────────────────────────── */
  if (action === 'read') {
    const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  /* ── WRITE / UPDATE A FILE ─────────────────────────────── */
  if (action === 'write') {
    const { path, content, sha, message } = body;
    const ghBody = { message, content, branch: GITHUB_BRANCH };
    if (sha) ghBody.sha = sha;

    const r    = await fetch(`${ghBase}/${path}`, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify(ghBody)
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  /* ── LIST A DIRECTORY ──────────────────────────────────── */
  if (action === 'list') {
    const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  /* ── DELETE A FILE ─────────────────────────────────────── */
  if (action === 'delete') {
    const { path, sha, message } = body;
    const r = await fetch(`${ghBase}/${path}`, {
      method: 'DELETE',
      headers: ghHeaders(),
      body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH })
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
};

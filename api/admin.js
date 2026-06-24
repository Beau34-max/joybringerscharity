/* ============================================================
   JOYBRINGERS ADMIN — Vercel Serverless API
   /api/admin.js

   Handles:
     - Login  (verifies email + password against env vars)
     - Session tokens  (HMAC-signed, 8-hour expiry, carry a role)
     - GitHub API proxy  (token never leaves the server) — admin role only for writes
     - Supabase proxy for Event Attendance & Grants Received — both roles

   Roles:
     admin      — full access (events, photos, content, settings, data entry)
     data_entry — can only log/view event attendance & grants received

   Required Vercel Environment Variables:
     ADMIN_EMAIL            e.g. admin@joybringerscharity.org
     ADMIN_PASSWORD         plain text password (stored encrypted by Vercel)
     GITHUB_TOKEN           Personal Access Token with "repo" scope
     SESSION_SECRET         any long random string
     STAFF_EMAIL            (optional) e.g. data@joybringerscharity.org
     STAFF_PASSWORD         (optional) password for restricted data-entry login
     SUPABASE_SERVICE_KEY   service_role secret key from Supabase project settings
   ============================================================ */

const crypto = require('crypto');

const GITHUB_OWNER   = 'Beau34-max';
const GITHUB_REPO    = 'joybringerswebsitesep';
const GITHUB_BRANCH  = 'main';
const SESSION_TTL     = 8 * 60 * 60 * 1000; // 8 hours
const SUPABASE_URL    = 'https://roofompdejyndlpqfrjl.supabase.co';
const ATTENDANCE_TABLE = 'event_attendance';
const GRANTS_TABLE     = 'grants_income';

/* ── helpers ─────────────────────────────────────────────── */

function makeSession(email, role) {
  const secret  = process.env.SESSION_SECRET || 'change-me-please';
  const payload = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + SESSION_TTL }))
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

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
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
    const staffEmail    = process.env.STAFF_EMAIL    || '';
    const staffPassword = process.env.STAFF_PASSWORD || '';
    const githubToken   = process.env.GITHUB_TOKEN   || '';

    if (!adminEmail || !adminPassword || !githubToken) {
      return res.status(503).json({
        error: 'Admin not configured yet. Please set ADMIN_EMAIL, ADMIN_PASSWORD, GITHUB_TOKEN, and SESSION_SECRET in your Vercel Environment Variables, then redeploy.'
      });
    }

    const { password } = body;
    if (!password) return res.status(401).json({ error: 'Incorrect password.' });

    // Plain comparison — password sent over HTTPS, no need for client-side hash
    if (password === adminPassword) {
      return res.status(200).json({ token: makeSession(adminEmail, 'admin'), role: 'admin' });
    }
    if (staffPassword && password === staffPassword) {
      return res.status(200).json({
        token: makeSession(staffEmail || 'data-entry@joybringerscharity.org', 'data_entry'),
        role: 'data_entry'
      });
    }
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  /* ── ALL OTHER ACTIONS REQUIRE A VALID SESSION ─────────── */
  const authHeader   = req.headers['authorization'] || '';
  const sessionToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const session      = checkSession(sessionToken);

  if (!session) {
    return res.status(401).json({ error: 'Session expired — please log in again.' });
  }
  const role = session.role || 'admin'; // sessions issued before roles existed default to admin

  /* ── GITHUB-BACKED ACTIONS — read/list open to all, write/delete admin-only ── */
  if (['read', 'write', 'list', 'delete'].includes(action)) {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(503).json({ error: 'GITHUB_TOKEN not set in environment variables.' });
    }
    if ((action === 'write' || action === 'delete') && role !== 'admin') {
      return res.status(403).json({ error: 'Your account does not have permission to do this.' });
    }

    if (action === 'read') {
      const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

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

    if (action === 'list') {
      const r    = await fetch(`${ghBase}/${body.path}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders() });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

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
  }

  /* ── SUPABASE-BACKED ACTIONS — Event Attendance & Grants Received ─── */
  const SUPABASE_ACTIONS = [
    'add_attendance', 'list_attendance', 'delete_attendance',
    'add_grant', 'list_grants', 'delete_grant'
  ];

  if (SUPABASE_ACTIONS.includes(action)) {
    if (!process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'SUPABASE_SERVICE_KEY not set in environment variables.' });
    }

    if (action === 'add_attendance' || action === 'add_grant') {
      const table  = action === 'add_attendance' ? ATTENDANCE_TABLE : GRANTS_TABLE;
      const record = { ...body.record, entered_by: session.email };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'list_attendance' || action === 'list_grants') {
      const table = action === 'list_attendance' ? ATTENDANCE_TABLE : GRANTS_TABLE;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?order=created_at.desc&limit=200`, {
        headers: sbHeaders()
      });
      const data = await r.json();
      return res.status(r.status).json(data);
    }

    if (action === 'delete_attendance' || action === 'delete_grant') {
      if (role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete entries.' });
      }
      const table = action === 'delete_attendance' ? ATTENDANCE_TABLE : GRANTS_TABLE;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${body.id}`, {
        method: 'DELETE',
        headers: sbHeaders()
      });
      return res.status(r.status).json({ ok: r.ok });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
};

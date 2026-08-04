const SUPABASE_URL = 'https://roofompdejyndlpqfrjl.supabase.co';

function sbHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  return {
    apikey:         key,
    Authorization:  `Bearer ${key}`,
    'Content-Type': 'application/json'
  };
}

function sanitize(reg) {
  return {
    id:             reg.id,
    reg_ref:        reg.reg_ref || null,
    first_name:     reg.first_name,
    last_name:      reg.last_name,
    event_name:     reg.event_name,
    event_date:     reg.event_date,
    main_attended:  !!reg.main_attended,
    family_members: (reg.family_members || []).map(fm => ({
      name:      fm.name,
      type:      fm.type,
      age_group: fm.age_group,
      attended:  !!fm.attended
    }))
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(503).json({ error: 'Service unavailable.' });

  const body   = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
  const action = body.action;

  // Returns distinct events that have registrations within the next 14 days
  if (action === 'get_events') {
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/event_registrations?select=event_name,event_date&event_date=gte.${today}&event_date=lte.${limit}&order=event_date.asc&limit=2000`,
      { headers: sbHeaders() }
    );
    const data = r.ok ? await r.json() : [];
    const map = {};
    for (const row of (Array.isArray(data) ? data : [])) {
      const key = `${row.event_name}|||${row.event_date}`;
      if (!map[key]) map[key] = { event_name: row.event_name, event_date: row.event_date, count: 0 };
      map[key].count++;
    }
    return res.status(200).json(Object.values(map));
  }

  // Returns sanitised participant list for an event (no email/phone)
  if (action === 'get_participants') {
    const { event_name, event_date } = body;
    if (!event_name) return res.status(400).json({ error: 'Event required.' });
    let url = `${SUPABASE_URL}/rest/v1/event_registrations?event_name=eq.${encodeURIComponent(event_name)}&order=last_name.asc,first_name.asc&limit=1000`;
    if (event_date) url += `&event_date=eq.${encodeURIComponent(event_date)}`;
    const r    = await fetch(url, { headers: sbHeaders() });
    const data = r.ok ? await r.json() : [];
    return res.status(200).json((Array.isArray(data) ? data : []).map(sanitize));
  }

  // Updates only the main_attended and family_members.*.attended fields
  if (action === 'checkin') {
    const { id, main_attended, family_attended } = body;
    if (!id) return res.status(400).json({ error: 'Registration ID required.' });

    // Fetch current family_members so we preserve name/type/age_group
    const getR = await fetch(
      `${SUPABASE_URL}/rest/v1/event_registrations?id=eq.${id}&select=family_members&limit=1`,
      { headers: sbHeaders() }
    );
    const rows = getR.ok ? await getR.json() : [];
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'Registration not found.' });

    const updatedFamily = (rows[0].family_members || []).map((fm, i) => ({
      ...fm,
      attended: Array.isArray(family_attended) ? !!family_attended[i] : !!fm.attended
    }));

    const patchR = await fetch(`${SUPABASE_URL}/rest/v1/event_registrations?id=eq.${id}`, {
      method:  'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body:    JSON.stringify({ main_attended: !!main_attended, family_members: updatedFamily })
    });
    if (!patchR.ok) {
      const msg = await patchR.text().catch(() => '');
      console.error('Supabase PATCH error:', patchR.status, msg);
      return res.status(500).json({ error: 'Check-in failed. Please try again.' });
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action.' });
};

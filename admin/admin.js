/* ============================================================
   JOYBRINGERS ADMIN PANEL — admin.js
   ============================================================ */

const GITHUB = {
  owner: 'Beau34-max',
  repo:  'joybringerswebsitesep',
  branch: 'main',
  api: 'https://api.github.com'
};

/* ============================================================
   AUTH UTILITIES
   ============================================================ */

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getStoredHash()  { return localStorage.getItem('jb_admin_pw') || ''; }
function getToken()       { return localStorage.getItem('jb_github_token') || ''; }
function isLoggedIn()     { return localStorage.getItem('jb_logged_in') === '1'; }

function logout() {
  localStorage.removeItem('jb_logged_in');
  location.reload();
}

/* ============================================================
   GITHUB API HELPERS
   ============================================================ */

function ghHeaders() {
  return {
    Authorization: `token ${getToken()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}

async function ghGet(path) {
  const res = await fetch(`${GITHUB.api}/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${path}?ref=${GITHUB.branch}`, {
    headers: ghHeaders()
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`);
  return res.json();
}

async function ghReadJSON(path) {
  const raw = await ghGet(path);
  const text = decodeURIComponent(escape(atob(raw.content.replace(/\n/g, ''))));
  return { data: JSON.parse(text), sha: raw.sha };
}

async function ghWriteFile(path, content, sha, message) {
  const encoded = btoa(unescape(encodeURIComponent(
    typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  )));
  const body = { message, content: encoded, branch: GITHUB.branch };
  if (sha) body.sha = sha;

  const res = await fetch(`${GITHUB.api}/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${path}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Write failed (${res.status})`);
  }
  return res.json();
}

async function ghUploadImage(file, targetPath) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        let sha = null;
        try { sha = (await ghGet(targetPath)).sha; } catch (_) { /* new file */ }

        const body = { message: `Admin: upload ${targetPath}`, content: base64, branch: GITHUB.branch };
        if (sha) body.sha = sha;

        const res = await fetch(`${GITHUB.api}/repos/${GITHUB.owner}/${GITHUB.repo}/contents/${targetPath}`, {
          method: 'PUT',
          headers: ghHeaders(),
          body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('Upload failed');
        resolve(targetPath);
      } catch (err) { reject(err); }
    };
    reader.readAsDataURL(file);
  });
}

async function verifyToken(token) {
  const res = await fetch(`${GITHUB.api}/repos/${GITHUB.owner}/${GITHUB.repo}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error('GitHub token is invalid or lacks repo access');
}

/* ============================================================
   UI HELPERS
   ============================================================ */

function showLoading(msg = 'Saving...') {
  const el = document.getElementById('loading-overlay');
  document.getElementById('loading-message').textContent = msg;
  el.style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showAlert(type, message) {
  const container = document.getElementById('alert-container');
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show shadow-sm mb-0`;
  div.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  container.appendChild(div);
  setTimeout(() => div.classList.remove('show'), 5000);
  setTimeout(() => div.remove(), 5600);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  const link = document.querySelector(`[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');

  const titles = { events: 'Events', photos: 'Photos & Gallery', content: 'Website Content', settings: 'Settings' };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;

  if (tabId === 'events')  loadEvents();
  if (tabId === 'photos')  renderGallery();
  if (tabId === 'content') loadContentTab();
}

/* ============================================================
   LOGIN / SETUP
   ============================================================ */

function initLoginScreen() {
  const hasPassword = !!getStoredHash();
  if (hasPassword) {
    document.getElementById('normal-login').style.display = 'block';
    document.getElementById('setup-screen').style.display  = 'none';
  } else {
    document.getElementById('setup-screen').style.display  = 'block';
    document.getElementById('normal-login').style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  /* Always verify the stored token with GitHub before skipping login.
     This prevents stale / expired tokens from bypassing the login screen. */
  if (isLoggedIn() && getToken()) {
    try {
      await verifyToken(getToken());
      showAdminPanel();
      switchTab('events');
      return;
    } catch (_) {
      /* Token invalid — clear auth and fall through to login */
      localStorage.removeItem('jb_logged_in');
      localStorage.removeItem('jb_github_token');
    }
  }

  document.getElementById('login-screen').style.display = 'flex';
  initLoginScreen();

  /* ---- First-time setup ---- */
  document.getElementById('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw  = document.getElementById('setup-password').value;
    const pw2 = document.getElementById('setup-confirm').value;
    const tok = document.getElementById('setup-token').value.trim();

    if (pw !== pw2) { showAlert('danger', 'Passwords do not match.'); return; }

    showLoading('Setting up...');
    try {
      await verifyToken(tok);
      const hash = await sha256(pw);
      localStorage.setItem('jb_admin_pw', hash);
      localStorage.setItem('jb_github_token', tok);
      localStorage.setItem('jb_logged_in', '1');
      hideLoading();
      showAdminPanel();
      switchTab('events');
    } catch (err) {
      hideLoading();
      showAlert('danger', err.message);
    }
  });

  /* ---- Normal login ---- */
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw  = document.getElementById('login-password').value;
    const tok = document.getElementById('login-token').value.trim();

    showLoading('Signing in...');
    try {
      const hash = await sha256(pw);
      if (hash !== getStoredHash()) throw new Error('Incorrect password.');

      const activeToken = tok || getToken();
      if (!activeToken) throw new Error('Please enter your GitHub token.');
      await verifyToken(activeToken);

      if (tok) localStorage.setItem('jb_github_token', tok);
      localStorage.setItem('jb_logged_in', '1');
      hideLoading();
      showAdminPanel();
      switchTab('events');
    } catch (err) {
      hideLoading();
      showAlert('danger', err.message);
    }
  });
});

function showAdminPanel() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display  = 'flex';
}

/* ============================================================
   EVENTS — STATE
   ============================================================ */

let eventsData = { items: [], sha: null };

/* ============================================================
   EVENTS — LOAD & RENDER
   ============================================================ */

async function loadEvents() {
  document.getElementById('events-list').innerHTML = '<p class="text-muted">Loading events...</p>';
  try {
    const { data, sha } = await ghReadJSON('data/events.json');
    eventsData = { items: data.items || [], sha };
    renderEventsList();
    updateStats();
  } catch (err) {
    document.getElementById('events-list').innerHTML =
      `<div class="alert alert-danger">Could not load events: ${err.message}</div>`;
  }
}

function updateStats() {
  const today = todayMidnight();
  const upcoming = eventsData.items.filter(e => new Date(e.date + 'T00:00:00') >= today).length;
  const past     = eventsData.items.length - upcoming;
  const featured = eventsData.items.filter(e => e.featured).length;
  const paid     = eventsData.items.filter(e => e.paidEvent).length;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-past').textContent     = past;
  document.getElementById('stat-featured').textContent = featured;
  document.getElementById('stat-paid').textContent     = paid;
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderEventsList(filter = '') {
  const container = document.getElementById('events-list');
  const today = todayMidnight();
  const lc = filter.toLowerCase();

  const items = eventsData.items
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => !lc || e.title.toLowerCase().includes(lc) || (e.venue || '').toLowerCase().includes(lc));

  if (!items.length) {
    container.innerHTML = filter
      ? '<p class="text-muted">No events match your search.</p>'
      : '<p class="text-muted">No events yet. Click <strong>Add New Event</strong> to get started.</p>';
    return;
  }

  /* Sort: upcoming first (featured first within upcoming), then past */
  items.sort(({ e: a }, { e: b }) => {
    const da = new Date(a.date + 'T00:00:00'), db = new Date(b.date + 'T00:00:00');
    const aUp = da >= today, bUp = db >= today;
    if (aUp !== bUp) return aUp ? -1 : 1;
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return da - db;
  });

  const rawBase = `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/`;

  container.innerHTML = items.map(({ e, idx }) => {
    const d = new Date(e.date + 'T00:00:00');
    const isUpcoming = d >= today;
    const statusBadge  = isUpcoming
      ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Upcoming</span>'
      : '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Past</span>';
    const featuredBadge = e.featured  ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1"><i class="fas fa-star fa-xs"></i> Featured</span>' : '';
    const paidBadge     = e.paidEvent ? '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle ms-1"><i class="fas fa-ticket fa-xs"></i> Paid</span>' : '';

    const imgSrc = e.image
      ? (e.image.startsWith('http') ? e.image : rawBase + e.image.replace(/^\//, ''))
      : '';

    return `
      <div class="event-row">
        <img class="event-row-thumb" src="${imgSrc}"
             onerror="this.style.background='#e5e7eb';this.removeAttribute('src')"
             alt="">
        <div class="event-row-info">
          <strong>${e.title}</strong>
          <small class="text-muted d-block">${fmtDate(e.date)}${e.time ? ' &bull; ' + e.time : ''} &bull; ${e.venue || '—'}</small>
          <div class="mt-1">${statusBadge}${featuredBadge}${paidBadge}</div>
        </div>
        <div class="event-row-actions">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditModal(${idx})">
            <i class="fas fa-pen"></i> Edit
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${idx})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

function filterEvents() {
  renderEventsList(document.getElementById('event-search').value);
}

/* ============================================================
   EVENTS — CRUD MODALS
   ============================================================ */

function openNewEventModal() {
  document.getElementById('event-modal-title').textContent = 'Add New Event';
  document.getElementById('event-form').reset();
  document.getElementById('event-idx').value = '';
  document.getElementById('event-current-image').value = '';
  document.getElementById('event-image-preview-wrap').style.display = 'none';
  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function openEditModal(idx) {
  const e = eventsData.items[idx];
  document.getElementById('event-modal-title').textContent = 'Edit Event';
  document.getElementById('event-idx').value              = idx;
  document.getElementById('event-title').value            = e.title        || '';
  document.getElementById('event-date').value             = e.date         || '';
  document.getElementById('event-time').value             = e.time         || '';
  document.getElementById('event-venue').value            = e.venue        || '';
  document.getElementById('event-description').value      = e.description  || '';
  document.getElementById('event-featured').checked       = !!e.featured;
  document.getElementById('event-paid').checked           = !!e.paidEvent;
  document.getElementById('event-reg-override').checked   = !!e.regOverrideOpen;
  document.getElementById('event-current-image').value    = e.image        || '';
  document.getElementById('event-image').value            = '';

  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  if (e.image) {
    const raw = `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/`;
    img.src = e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }

  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function previewEventImage() {
  const file = document.getElementById('event-image').files[0];
  if (!file) return;
  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  const reader = new FileReader();
  reader.onload = (e) => { img.src = e.target.result; wrap.style.display = 'block'; };
  reader.readAsDataURL(file);
}

async function saveEvent() {
  const idx       = document.getElementById('event-idx').value;
  const imageFile = document.getElementById('event-image').files[0];
  const title     = document.getElementById('event-title').value.trim();

  if (!title || !document.getElementById('event-date').value || !document.getElementById('event-venue').value || !document.getElementById('event-description').value) {
    showAlert('warning', 'Please fill in all required fields (title, date, venue, description).');
    return;
  }

  showLoading(idx !== '' ? 'Updating event...' : 'Adding event...');

  try {
    let imagePath = document.getElementById('event-current-image').value;

    if (imageFile) {
      const ext  = imageFile.name.split('.').pop().toLowerCase();
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const target = `images/events/${slug}-${Date.now()}.${ext}`;
      showLoading('Uploading image...');
      await ghUploadImage(imageFile, target);
      imagePath = target;
    }

    const eventObj = {
      title,
      date:           document.getElementById('event-date').value,
      time:           document.getElementById('event-time').value,
      venue:          document.getElementById('event-venue').value,
      description:    document.getElementById('event-description').value,
      image:          imagePath,
      featured:       document.getElementById('event-featured').checked,
      paidEvent:      document.getElementById('event-paid').checked,
      regOverrideOpen: document.getElementById('event-reg-override').checked
    };

    if (idx !== '') {
      eventsData.items[parseInt(idx)] = eventObj;
    } else {
      eventsData.items.push(eventObj);
    }

    showLoading('Saving to website...');
    const result = await ghWriteFile(
      'data/events.json',
      { items: eventsData.items },
      eventsData.sha,
      `Admin: ${idx !== '' ? 'update' : 'add'} event — ${title}`
    );
    eventsData.sha = result.content.sha;

    bootstrap.Modal.getInstance(document.getElementById('eventModal')).hide();
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Event saved! The website will update in ~1 minute.`);
    renderEventsList();
    updateStats();
  } catch (err) {
    hideLoading();
    showAlert('danger', `<i class="fas fa-times-circle"></i> Error: ${err.message}`);
  }
}

async function deleteEvent(idx) {
  const e = eventsData.items[idx];
  if (!confirm(`Delete "${e.title}"?\n\nThis cannot be undone.`)) return;

  showLoading('Deleting event...');
  try {
    eventsData.items.splice(idx, 1);
    const result = await ghWriteFile(
      'data/events.json',
      { items: eventsData.items },
      eventsData.sha,
      `Admin: delete event — ${e.title}`
    );
    eventsData.sha = result.content.sha;
    hideLoading();
    showAlert('success', `Event "${e.title}" deleted.`);
    renderEventsList();
    updateStats();
  } catch (err) {
    hideLoading();
    showAlert('danger', `Error: ${err.message}`);
  }
}

/* ============================================================
   PHOTOS / GALLERY
   ============================================================ */

function previewUploadPhoto() {
  const file = document.getElementById('photo-upload-input').files[0];
  if (!file) return;
  const wrap = document.getElementById('photo-upload-preview');
  const img  = document.getElementById('photo-preview-img');
  const reader = new FileReader();
  reader.onload = (e) => {
    img.src = e.target.result;
    document.getElementById('photo-preview-name').textContent = file.name;
    document.getElementById('photo-preview-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
    wrap.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function uploadPhoto() {
  const file = document.getElementById('photo-upload-input').files[0];
  if (!file) { showAlert('warning', 'Please select a photo first.'); return; }

  const folder = document.getElementById('photo-folder').value;
  const target = `${folder}/${file.name}`;

  showLoading('Uploading photo...');
  try {
    await ghUploadImage(file, target);
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Photo uploaded to <code>${target}</code>`);
    document.getElementById('photo-upload-input').value = '';
    document.getElementById('photo-upload-preview').style.display = 'none';
    if (folder === 'images/events') renderGallery();
  } catch (err) {
    hideLoading();
    showAlert('danger', `Upload failed: ${err.message}`);
  }
}

async function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '<div class="col-12"><p class="text-muted">Loading photos...</p></div>';

  try {
    const res = await fetch(
      `${GITHUB.api}/repos/${GITHUB.owner}/${GITHUB.repo}/contents/images/events?ref=${GITHUB.branch}`,
      { headers: ghHeaders() }
    );
    if (!res.ok) throw new Error('Could not list photos');
    const files = await res.json();
    const images = Array.isArray(files) ? files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)) : [];

    if (!images.length) {
      grid.innerHTML = '<div class="col-12"><p class="text-muted">No photos in images/events/ yet.</p></div>';
      return;
    }

    const raw = `https://raw.githubusercontent.com/${GITHUB.owner}/${GITHUB.repo}/${GITHUB.branch}/`;
    grid.innerHTML = images.map(f => `
      <div class="col-6 col-md-3 col-lg-2">
        <div class="gallery-photo-card">
          <img src="${raw}${f.path}" alt="${f.name}" loading="lazy">
          <div class="photo-caption" title="${f.path}">
            <code style="font-size:11px">${f.path}</code>
          </div>
        </div>
      </div>`).join('');
  } catch (err) {
    grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Could not load gallery: ${err.message}</div></div>`;
  }
}

/* ============================================================
   CONTENT SECTIONS
   ============================================================ */

let contentShas = {};

async function loadContentTab() {
  /* Load impact */
  try {
    const { data, sha } = await ghReadJSON('data/impact.json');
    contentShas.impact = sha;
    document.getElementById('impact-young-people').value = data.young_people_supported || '';
    document.getElementById('impact-donation').value      = data.donation_message  || '';
    document.getElementById('impact-volunteer').value     = data.volunteer_message || '';
  } catch (_) { /* silent */ }

  /* Load footer */
  try {
    const { data, sha } = await ghReadJSON('data/footer.json');
    contentShas.footer = sha;
    document.getElementById('footer-email').value      = data.email      || '';
    document.getElementById('footer-phone').value      = data.phone      || '';
    document.getElementById('footer-company').value    = data.company    || '';
    document.getElementById('footer-company-no').value = data.company_no || '';
    document.getElementById('footer-charity-no').value = data.charity_no || '';

    const socials = data.socials || [];
    const get = (plat) => (socials.find(s => s.platform.toLowerCase() === plat.toLowerCase()) || {}).url || '';
    document.getElementById('footer-facebook').value  = get('facebook');
    document.getElementById('footer-instagram').value = get('instagram');
    document.getElementById('footer-linkedin').value  = get('linkedin');
    document.getElementById('footer-twitter').value   = get('twitter');
    document.getElementById('footer-tiktok').value    = get('tiktok');
  } catch (_) { /* silent */ }

  /* Load partners */
  try {
    const { data, sha } = await ghReadJSON('data/partners.json');
    contentShas.partners = sha;
    renderPartnersEditor(data.items || []);
  } catch (_) { /* silent */ }
}

async function saveImpact() {
  showLoading('Saving impact numbers...');
  try {
    const payload = {
      young_people_supported: parseInt(document.getElementById('impact-young-people').value) || 0,
      donation_message:  document.getElementById('impact-donation').value,
      volunteer_message: document.getElementById('impact-volunteer').value
    };
    const result = await ghWriteFile('data/impact.json', payload, contentShas.impact, 'Admin: update impact numbers');
    contentShas.impact = result.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Impact numbers saved! Goes live in ~1 minute.');
  } catch (err) {
    hideLoading();
    showAlert('danger', `Error: ${err.message}`);
  }
}

async function saveFooter() {
  showLoading('Saving footer info...');
  try {
    const existingRes = await ghReadJSON('data/footer.json');
    const existing = existingRes.data;

    /* Update social URLs in-place */
    const socialMap = {
      facebook:  document.getElementById('footer-facebook').value,
      instagram: document.getElementById('footer-instagram').value,
      linkedin:  document.getElementById('footer-linkedin').value,
      twitter:   document.getElementById('footer-twitter').value,
      tiktok:    document.getElementById('footer-tiktok').value
    };

    const updatedSocials = (existing.socials || []).map(s => ({
      ...s,
      url: socialMap[s.platform.toLowerCase()] || s.url
    }));

    /* Add any that weren't in existing */
    Object.entries(socialMap).forEach(([plat, url]) => {
      if (url && !updatedSocials.find(s => s.platform.toLowerCase() === plat)) {
        updatedSocials.push({ platform: plat.charAt(0).toUpperCase() + plat.slice(1), url, icon: `icon-${plat}` });
      }
    });

    const payload = {
      ...existing,
      email:      document.getElementById('footer-email').value,
      phone:      document.getElementById('footer-phone').value,
      company:    document.getElementById('footer-company').value,
      company_no: document.getElementById('footer-company-no').value,
      charity_no: document.getElementById('footer-charity-no').value,
      socials:    updatedSocials
    };

    const result = await ghWriteFile('data/footer.json', payload, existingRes.sha, 'Admin: update footer info');
    contentShas.footer = result.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Footer info saved! Goes live in ~1 minute.');
  } catch (err) {
    hideLoading();
    showAlert('danger', `Error: ${err.message}`);
  }
}

/* ---- Partners editor ---- */

function renderPartnersEditor(items) {
  const container = document.getElementById('partners-list-editor');
  container.innerHTML = '';
  items.forEach((p, i) => appendPartnerRow(p, i));
}

function appendPartnerRow(p = {}, idx = null) {
  const container = document.getElementById('partners-list-editor');
  const id = idx !== null ? idx : Date.now();
  const div = document.createElement('div');
  div.className = 'partner-row';
  div.dataset.partnerIdx = id;
  div.innerHTML = `
    <div class="flex-grow-1">
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label mb-1">Name</label>
          <input type="text" class="form-control form-control-sm partner-name" value="${p.name || ''}" placeholder="Partner name">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Logo Image Path</label>
          <input type="text" class="form-control form-control-sm partner-logo" value="${p.logo || ''}" placeholder="images/partners/logo.png">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Website Link</label>
          <input type="url" class="form-control form-control-sm partner-link" value="${p.link || ''}" placeholder="https://...">
        </div>
      </div>
    </div>
    <button type="button" class="btn btn-outline-danger btn-sm align-self-end ms-2" onclick="this.closest('.partner-row').remove()">
      <i class="fas fa-trash"></i>
    </button>`;
  container.appendChild(div);
}

function addPartnerRow() { appendPartnerRow(); }

async function savePartners() {
  showLoading('Saving partners...');
  try {
    const rows  = document.querySelectorAll('.partner-row');
    const items = Array.from(rows).map(row => ({
      name: row.querySelector('.partner-name').value,
      logo: row.querySelector('.partner-logo').value,
      link: row.querySelector('.partner-link').value
    })).filter(p => p.name);

    const result = await ghWriteFile('data/partners.json', { items }, contentShas.partners, 'Admin: update partners');
    contentShas.partners = result.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Partners saved! Goes live in ~1 minute.');
  } catch (err) {
    hideLoading();
    showAlert('danger', `Error: ${err.message}`);
  }
}

/* ============================================================
   SETTINGS
   ============================================================ */

async function changePassword(e) {
  e.preventDefault();
  const current  = document.getElementById('current-password').value;
  const next     = document.getElementById('new-password').value;
  const confirm  = document.getElementById('confirm-password').value;

  if (next !== confirm) { showAlert('danger', 'New passwords do not match.'); return; }

  const currentHash = await sha256(current);
  if (currentHash !== getStoredHash()) { showAlert('danger', 'Current password is incorrect.'); return; }

  const newHash = await sha256(next);
  localStorage.setItem('jb_admin_pw', newHash);
  document.getElementById('change-password-form').reset();
  showAlert('success', '<i class="fas fa-check-circle"></i> Password updated successfully.');
}

async function updateToken() {
  const tok = document.getElementById('new-token').value.trim();
  if (!tok) { showAlert('warning', 'Please enter a token.'); return; }

  showLoading('Verifying token...');
  try {
    await verifyToken(tok);
    localStorage.setItem('jb_github_token', tok);
    document.getElementById('new-token').value = '';
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> GitHub token updated.');
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

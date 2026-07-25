/* ============================================================
   JOYBRINGERS ADMIN PANEL — admin.js
   All GitHub operations go through /api/admin (serverless).
   Volunteers only need email + password — no GitHub token.
   ============================================================ */

const API = '/api/admin';

/* ── session ─────────────────────────────────────────────── */

function getSession()    { return localStorage.getItem('jb_session') || ''; }
function getRole()       { return localStorage.getItem('jb_role') || 'admin'; }
function isAdmin()       { return getRole() === 'admin'; }
function clearSession()  {
  localStorage.removeItem('jb_session');
  localStorage.removeItem('jb_email');
  localStorage.removeItem('jb_role');
}
function isLoggedIn()    { return !!getSession(); }

function logout() {
  clearSession();
  location.reload();
}

/* ── API helper ──────────────────────────────────────────── */

async function apiCall(action, data = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getSession()}`
    },
    body: JSON.stringify({ action, ...data })
  });

  const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));

  if (res.status === 401) {
    clearSession();
    showAlert('warning', 'Your session expired. Please log in again.');
    setTimeout(() => location.reload(), 2000);
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

async function apiReadJSON(path) {
  const raw  = await apiCall('read', { path });
  const text = decodeURIComponent(escape(atob(raw.content.replace(/\n/g, ''))));
  return { data: JSON.parse(text), sha: raw.sha };
}

async function apiWriteJSON(path, content, sha, message) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
  return apiCall('write', { path, content: encoded, sha, message });
}

async function apiUploadImage(file, targetPath) {
  if (file.size > 3 * 1024 * 1024) throw new Error('Image is too large (max 3 MB). Please resize it first.');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload  = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        // check if file already exists to get its sha
        let sha = null;
        try { sha = (await apiCall('read', { path: targetPath })).sha; } catch (_) { /* new file */ }
        await apiCall('write', { path: targetPath, content: base64, sha, message: `Admin: upload ${targetPath}` });
        resolve(targetPath);
      } catch (err) { reject(err); }
    };
    reader.readAsDataURL(file);
  });
}

/* ── UI helpers ──────────────────────────────────────────── */

function showLoading(msg = 'Saving...') {
  document.getElementById('loading-message').textContent = msg;
  document.getElementById('loading-overlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

function showAlert(type, message) {
  const c   = document.getElementById('alert-container');
  const div = document.createElement('div');
  div.className = `alert alert-${type} alert-dismissible fade show shadow-sm mb-0`;
  div.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
  c.appendChild(div);
  setTimeout(() => div.classList.remove('show'), 5500);
  setTimeout(() => div.remove(), 6100);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}

function togglePasswordVisibility() {
  const input = document.getElementById('login-password');
  const icon  = document.getElementById('pw-eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).style.display = 'block';
  const link = document.querySelector(`[data-tab="${tabId}"]`);
  if (link) link.classList.add('active');
  const titles = { events: 'Events', photos: 'Photos & Gallery', content: 'Website Content', dataentry: 'Data Entry', visitors: 'Visitor Log', settings: 'Settings' };
  document.getElementById('page-title').textContent = titles[tabId] || tabId;
  // close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');

  if (tabId === 'events')    loadEvents();
  if (tabId === 'photos')    { renderGallery('events'); renderGallery('partners'); }
  if (tabId === 'content')   loadContentTab();
  if (tabId === 'dataentry') loadDataEntryTab();
  if (tabId === 'visitors')  initVisitorTab();
}

/* ── Role-based UI restriction ───────────────────────────── */

function applyRoleUI() {
  const role = getRole();
  document.querySelectorAll('.sidebar-link[data-roles]').forEach(el => {
    const allowed = el.dataset.roles.split(',');
    el.style.display = allowed.includes(role) ? '' : 'none';
  });
}

/* ── SHA-256 (for password hashing in browser) ───────────── */

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // If a session is stored, verify it quickly with the server
  if (isLoggedIn()) {
    apiCall('list', { path: 'data' })
      .then(() => { showAdminPanel(); switchTab(getRole() === 'data_entry' ? 'dataentry' : 'events'); })
      .catch(() => { clearSession(); showLoginScreen(); });
    return;
  }
  showLoginScreen();
});

function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-panel').style.display  = 'none';
}

function showAdminPanel() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display  = 'flex';
  const email = localStorage.getItem('jb_email') || '';
  document.getElementById('logged-in-email').textContent = email;
  applyRoleUI();
}

/* ── LOGIN ───────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorBox = document.getElementById('login-error');
    errorBox.style.display = 'none';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const result = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const data = await result.json().catch(() => ({ error: `Server error (${result.status})` }));
      if (!result.ok) throw new Error(data.error || `Login failed (${result.status})`);

      localStorage.setItem('jb_session', data.token);
      localStorage.setItem('jb_email',   email);
      localStorage.setItem('jb_role',    data.role || 'admin');
      showAdminPanel();
      switchTab(data.role === 'data_entry' ? 'dataentry' : 'events');
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Request timed out — check your connection.' : err.message;
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      window.alert('Login error: ' + msg);
    }
  });
});

/* ============================================================
   EVENTS
   ============================================================ */

let eventsData = { items: [], sha: null };

async function loadEvents() {
  document.getElementById('events-list').innerHTML = '<p class="text-muted">Loading events...</p>';
  try {
    const { data, sha } = await apiReadJSON('data/events.json');
    eventsData = { items: data.items || [], sha };
    renderEventsList();
    updateStats();
  } catch (err) {
    document.getElementById('events-list').innerHTML =
      `<div class="alert alert-danger">Could not load events: ${err.message}</div>`;
  }
}

function todayMidnight() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function updateStats() {
  const today    = todayMidnight();
  const upcoming = eventsData.items.filter(e => new Date(e.date + 'T00:00:00') >= today).length;
  document.getElementById('stat-upcoming').textContent = upcoming;
  document.getElementById('stat-past').textContent     = eventsData.items.length - upcoming;
  document.getElementById('stat-featured').textContent = eventsData.items.filter(e => e.featured).length;
  document.getElementById('stat-paid').textContent     = eventsData.items.filter(e => e.paidEvent).length;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderEventsList(filter = '') {
  const container = document.getElementById('events-list');
  const today     = todayMidnight();
  const lc        = filter.toLowerCase();

  const items = eventsData.items
    .map((e, idx) => ({ e, idx }))
    .filter(({ e }) => !lc || e.title.toLowerCase().includes(lc) || (e.venue || '').toLowerCase().includes(lc));

  if (!items.length) {
    container.innerHTML = filter
      ? '<p class="text-muted">No events match your search.</p>'
      : '<p class="text-muted">No events yet. Click <strong>Add New Event</strong> to get started.</p>';
    return;
  }

  items.sort(({ e: a }, { e: b }) => {
    const da = new Date(a.date + 'T00:00:00'), db = new Date(b.date + 'T00:00:00');
    const aUp = da >= today, bUp = db >= today;
    if (aUp !== bUp) return aUp ? -1 : 1;
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return da - db;
  });

  const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';

  container.innerHTML = items.map(({ e, idx }) => {
    const isUp = new Date(e.date + 'T00:00:00') >= today;
    const statusBadge   = isUp
      ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle">Upcoming</span>'
      : '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Past</span>';
    const featuredBadge = e.featured  ? ' <span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle"><i class="fas fa-star fa-xs"></i> Featured</span>' : '';
    const paidBadge     = e.paidEvent ? ' <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle"><i class="fas fa-ticket fa-xs"></i> Paid</span>' : '';
    const imgSrc = e.image ? (e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '')) : '';

    return `
      <div class="event-row">
        <img class="event-row-thumb" src="${imgSrc}"
             onerror="this.style.background='#e5e7eb';this.removeAttribute('src')" alt="">
        <div class="event-row-info">
          <strong>${e.title}</strong>
          <small class="text-muted d-block">${fmtDate(e.date)}${e.time ? ' &bull; ' + e.time : ''} &bull; ${e.venue || '—'}</small>
          <div class="mt-1">${statusBadge}${featuredBadge}${paidBadge}</div>
        </div>
        <div class="event-row-actions">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditModal(${idx})">
            <i class="fas fa-pen"></i> Edit
          </button>
          <button class="btn btn-sm btn-outline-secondary" onclick="duplicateEvent(${idx})" title="Duplicate this event">
            <i class="fas fa-copy"></i>
          </button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${idx})"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function filterEvents() {
  renderEventsList(document.getElementById('event-search').value);
}

/* ── Event modal ─────────────────────────────────────────── */

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
  document.getElementById('event-modal-title').textContent   = 'Edit Event';
  document.getElementById('event-idx').value                 = idx;
  document.getElementById('event-title').value               = e.title        || '';
  document.getElementById('event-date').value                = e.date         || '';
  document.getElementById('event-time').value                = e.time         || '';
  document.getElementById('event-venue').value               = e.venue        || '';
  document.getElementById('event-joining-link').value        = e.joiningLink  || '';
  document.getElementById('event-description').value         = e.description  || '';
  document.getElementById('event-featured').checked          = !!e.featured;
  document.getElementById('event-paid').checked              = !!e.paidEvent;
  document.getElementById('event-reg-override').checked      = !!e.regOverrideOpen;
  document.getElementById('event-current-image').value       = e.image        || '';
  document.getElementById('event-image').value               = '';

  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  if (e.image) {
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
    img.src = e.image.startsWith('http') ? e.image : raw + e.image.replace(/^\//, '');
    wrap.style.display = 'block';
  } else {
    wrap.style.display = 'none';
  }
  new bootstrap.Modal(document.getElementById('eventModal')).show();
}

function duplicateEvent(idx) {
  const e = eventsData.items[idx];
  document.getElementById('event-modal-title').textContent   = 'Duplicate Event';
  document.getElementById('event-idx').value                 = '';  // no idx = creates new
  document.getElementById('event-title').value               = e.title + ' (Copy)';
  document.getElementById('event-date').value                = '';  // admin must set new date
  document.getElementById('event-time').value                = e.time         || '';
  document.getElementById('event-venue').value               = e.venue        || '';
  document.getElementById('event-joining-link').value        = e.joiningLink  || '';
  document.getElementById('event-description').value         = e.description  || '';
  document.getElementById('event-featured').checked          = !!e.featured;
  document.getElementById('event-paid').checked              = !!e.paidEvent;
  document.getElementById('event-reg-override').checked      = !!e.regOverrideOpen;
  document.getElementById('event-current-image').value       = e.image        || '';
  document.getElementById('event-image').value               = '';

  const wrap = document.getElementById('event-image-preview-wrap');
  const img  = document.getElementById('event-image-preview');
  if (e.image) {
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
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
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('event-image-preview').src = e.target.result;
    document.getElementById('event-image-preview-wrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

async function saveEvent() {
  const idx       = document.getElementById('event-idx').value;
  const imageFile = document.getElementById('event-image').files[0];
  const title     = document.getElementById('event-title').value.trim();

  if (!title || !document.getElementById('event-date').value ||
      !document.getElementById('event-venue').value || !document.getElementById('event-description').value) {
    showAlert('warning', 'Please fill in all required fields (title, date, venue, description).');
    return;
  }

  showLoading(idx !== '' ? 'Updating event...' : 'Adding event...');

  try {
    let imagePath = document.getElementById('event-current-image').value;

    if (imageFile) {
      const ext    = imageFile.name.split('.').pop().toLowerCase();
      const slug   = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const target = `images/events/${slug}-${Date.now()}.${ext}`;
      showLoading('Uploading image...');
      await apiUploadImage(imageFile, target);
      imagePath = target;
    }

    const joiningLink = document.getElementById('event-joining-link').value.trim();
    const eventObj = {
      title,
      date:            document.getElementById('event-date').value,
      time:            document.getElementById('event-time').value,
      venue:           document.getElementById('event-venue').value,
      description:     document.getElementById('event-description').value,
      image:           imagePath,
      featured:        document.getElementById('event-featured').checked,
      paidEvent:       document.getElementById('event-paid').checked,
      regOverrideOpen: document.getElementById('event-reg-override').checked,
      ...(joiningLink && { joiningLink })
    };

    if (idx !== '') eventsData.items[parseInt(idx)] = eventObj;
    else            eventsData.items.push(eventObj);

    showLoading('Saving to website...');
    const result = await apiWriteJSON(
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
    showAlert('danger', `<i class="fas fa-times-circle"></i> ${err.message}`);
  }
}

async function deleteEvent(idx) {
  const e = eventsData.items[idx];
  if (!confirm(`Delete "${e.title}"?\n\nThis cannot be undone.`)) return;

  showLoading('Deleting event...');
  try {
    eventsData.items.splice(idx, 1);
    const result = await apiWriteJSON(
      'data/events.json',
      { items: eventsData.items },
      eventsData.sha,
      `Admin: delete event — ${e.title}`
    );
    eventsData.sha = result.content.sha;
    hideLoading();
    showAlert('success', `"${e.title}" deleted.`);
    renderEventsList();
    updateStats();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

/* ============================================================
   PHOTOS / GALLERY
   ============================================================ */

function previewUploadPhoto() {
  const file = document.getElementById('photo-upload-input').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('photo-preview-img').src = e.target.result;
    document.getElementById('photo-preview-name').textContent = file.name;
    document.getElementById('photo-preview-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
    document.getElementById('photo-upload-preview').style.display = 'block';
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
    await apiUploadImage(file, target);
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Photo uploaded to <code>${target}</code>`);
    document.getElementById('photo-upload-input').value = '';
    document.getElementById('photo-upload-preview').style.display = 'none';
    if (folder.includes('events'))   renderGallery('events');
    if (folder.includes('partners')) renderGallery('partners');
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function renderGallery(folder = 'events') {
  const gridId = folder === 'partners' ? 'partners-gallery-grid' : 'gallery-grid';
  const grid   = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '<div class="col-12"><p class="text-muted">Loading...</p></div>';
  try {
    const files  = await apiCall('list', { path: `images/${folder}` });
    const images = Array.isArray(files) ? files.filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name)) : [];

    if (!images.length) {
      grid.innerHTML = `<div class="col-12"><p class="text-muted">No photos in images/${folder}/ yet.</p></div>`;
      return;
    }
    const raw = 'https://raw.githubusercontent.com/Beau34-max/joybringerswebsitesep/main/';
    grid.innerHTML = images.map(f => `
      <div class="col-6 col-md-3 col-lg-2">
        <div class="gallery-photo-card" style="position:relative;">
          <img src="${raw}${f.path}" alt="${f.name}" loading="lazy">
          <div class="photo-caption" title="${f.path}"><code style="font-size:10px">${f.name}</code></div>
          ${isAdmin() ? `<button onclick="deletePhoto('${f.path}','${f.sha}','${folder}')"
            title="Delete photo"
            style="position:absolute;top:4px;right:4px;background:rgba(220,38,38,0.85);border:none;border-radius:50%;width:26px;height:26px;color:white;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">
            <i class="fas fa-trash"></i>
          </button>` : ''}
        </div>
      </div>`).join('');
  } catch (err) {
    grid.innerHTML = `<div class="col-12"><div class="alert alert-danger">Could not load: ${err.message}</div></div>`;
  }
}

async function deletePhoto(path, sha, folder) {
  if (!confirm(`Delete "${path.split('/').pop()}"?\n\nThis cannot be undone.`)) return;
  showLoading('Deleting photo...');
  try {
    await apiCall('delete', { path, sha, message: `Admin: delete photo — ${path}` });
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Photo deleted.`);
    renderGallery(folder);
  } catch (err) {
    hideLoading();
    showAlert('danger', `<i class="fas fa-times-circle"></i> ${err.message}`);
  }
}

/* ============================================================
   CONTENT SECTIONS
   ============================================================ */

let contentShas = {};

async function loadContentTab() {
  /* impact */
  try {
    const { data, sha } = await apiReadJSON('data/impact.json');
    contentShas.impact = sha;
    document.getElementById('impact-young-people').value = data.young_people_supported || '';
    document.getElementById('impact-events').value       = data.events_workshops       || '';
    document.getElementById('impact-partner-orgs').value = data.partner_orgs           || '';
    document.getElementById('impact-volunteers').value   = data.active_volunteers      || '';
    document.getElementById('impact-donation').value     = data.donation_message       || '';
    document.getElementById('impact-volunteer').value    = data.volunteer_message      || '';
  } catch (_) {}

  /* footer */
  try {
    const { data, sha } = await apiReadJSON('data/footer.json');
    contentShas.footer = sha;
    document.getElementById('footer-email').value      = data.email      || '';
    document.getElementById('footer-phone').value      = data.phone      || '';
    document.getElementById('footer-company').value    = data.company    || '';
    document.getElementById('footer-company-no').value = data.company_no || '';
    document.getElementById('footer-charity-no').value = data.charity_no || '';
    const get = (plat) => ((data.socials || []).find(s => s.platform.toLowerCase() === plat) || {}).url || '';
    document.getElementById('footer-facebook').value  = get('facebook');
    document.getElementById('footer-instagram').value = get('instagram');
    document.getElementById('footer-linkedin').value  = get('linkedin');
    document.getElementById('footer-twitter').value   = get('twitter');
    document.getElementById('footer-tiktok').value    = get('tiktok');
  } catch (_) {}

  /* partners */
  try {
    const { data, sha } = await apiReadJSON('data/partners.json');
    contentShas.partners = sha;
    renderPartnersEditor(data.items || []);
  } catch (_) {}

  /* foodbank impact */
  try {
    const { data, sha } = await apiReadJSON('data/foodbank-impact.json');
    contentShas.foodbank = sha;
    document.getElementById('fb-impact-people').value      = data.people_supported      || '';
    document.getElementById('fb-impact-volunteers').value  = data.volunteers            || '';
    document.getElementById('fb-impact-collections').value = data.collections_completed || '';
    document.getElementById('fb-impact-kg').value          = data.food_rescued_kg       || '';
    document.getElementById('fb-impact-meals').value       = data.meals_provided        || '';
    document.getElementById('fb-impact-co2').value         = data.co2_saved_kg          || '';
  } catch (_) {}
}

async function saveFoodbankImpact() {
  showLoading('Saving...');
  try {
    const payload = {
      people_supported:      parseInt(document.getElementById('fb-impact-people').value)      || 0,
      volunteers:            parseInt(document.getElementById('fb-impact-volunteers').value)  || 0,
      collections_completed: parseInt(document.getElementById('fb-impact-collections').value) || 0,
      food_rescued_kg:       parseInt(document.getElementById('fb-impact-kg').value)          || 0,
      meals_provided:        parseInt(document.getElementById('fb-impact-meals').value)       || 0,
      co2_saved_kg:          parseInt(document.getElementById('fb-impact-co2').value)          || 0
    };
    const r = await apiWriteJSON('data/foodbank-impact.json', payload, contentShas.foodbank, 'Admin: update foodbank impact numbers');
    contentShas.foodbank = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Foodbank numbers saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

async function saveImpact() {
  showLoading('Saving...');
  try {
    const payload = {
      young_people_supported: parseInt(document.getElementById('impact-young-people').value) || 0,
      events_workshops:       parseInt(document.getElementById('impact-events').value)       || 0,
      partner_orgs:           parseInt(document.getElementById('impact-partner-orgs').value) || 0,
      active_volunteers:      parseInt(document.getElementById('impact-volunteers').value)   || 0,
      donation_message:  document.getElementById('impact-donation').value,
      volunteer_message: document.getElementById('impact-volunteer').value
    };
    const r = await apiWriteJSON('data/impact.json', payload, contentShas.impact, 'Admin: update impact numbers');
    contentShas.impact = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Impact numbers saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

async function saveFooter() {
  showLoading('Saving...');
  try {
    const { data, sha } = await apiReadJSON('data/footer.json');
    const socialMap = {
      facebook: document.getElementById('footer-facebook').value,
      instagram: document.getElementById('footer-instagram').value,
      linkedin: document.getElementById('footer-linkedin').value,
      twitter: document.getElementById('footer-twitter').value,
      tiktok: document.getElementById('footer-tiktok').value
    };
    const updatedSocials = (data.socials || []).map(s => ({
      ...s, url: socialMap[s.platform.toLowerCase()] || s.url
    }));
    Object.entries(socialMap).forEach(([plat, url]) => {
      if (url && !updatedSocials.find(s => s.platform.toLowerCase() === plat))
        updatedSocials.push({ platform: plat.charAt(0).toUpperCase() + plat.slice(1), url, icon: `icon-${plat}` });
    });
    const payload = {
      ...data,
      email:      document.getElementById('footer-email').value,
      phone:      document.getElementById('footer-phone').value,
      company:    document.getElementById('footer-company').value,
      company_no: document.getElementById('footer-company-no').value,
      charity_no: document.getElementById('footer-charity-no').value,
      socials:    updatedSocials
    };
    const r = await apiWriteJSON('data/footer.json', payload, sha, 'Admin: update footer info');
    contentShas.footer = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Footer info saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

/* partners editor */
function renderPartnersEditor(items) {
  document.getElementById('partners-list-editor').innerHTML = '';
  items.forEach((p, i) => appendPartnerRow(p));
}
function appendPartnerRow(p = {}) {
  const container = document.getElementById('partners-list-editor');
  const div = document.createElement('div');
  div.className = 'partner-row';
  div.innerHTML = `
    <div class="flex-grow-1">
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label mb-1">Name</label>
          <input type="text" class="form-control form-control-sm partner-name" value="${p.name || ''}" placeholder="Partner name">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Logo Path</label>
          <input type="text" class="form-control form-control-sm partner-logo" value="${p.logo || ''}" placeholder="images/partners/logo.png">
        </div>
        <div class="col-md-4">
          <label class="form-label mb-1">Website</label>
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
  showLoading('Saving...');
  try {
    const items = Array.from(document.querySelectorAll('.partner-row')).map(row => ({
      name: row.querySelector('.partner-name').value,
      logo: row.querySelector('.partner-logo').value,
      link: row.querySelector('.partner-link').value
    })).filter(p => p.name);
    const r = await apiWriteJSON('data/partners.json', { items }, contentShas.partners, 'Admin: update partners');
    contentShas.partners = r.content.sha;
    hideLoading();
    showAlert('success', '<i class="fas fa-check-circle"></i> Partners saved! Goes live in ~1 minute.');
  } catch (err) { hideLoading(); showAlert('danger', err.message); }
}

/* ============================================================
   DATA ENTRY — Event Attendance & Grants Received
   Stored in Supabase, not GitHub — available to both admin
   and data_entry roles. Deleting entries is admin-only.
   ============================================================ */

function loadDataEntryTab() {
  populateAttendanceEventOptions();
  loadAttendanceList();
  loadGrantsList();
  loadFoodbankList();
  loadAssetsList();
}

let attendanceRows = [];
let grantsRows     = [];
let foodbankRows   = [];
let assetsRows     = [];

let editingAttendanceId = null;
let editingGrantId       = null;
let editingFoodbankId    = null;
let editingAssetId       = null;

async function populateAttendanceEventOptions() {
  const select = document.getElementById('attendance-event-select');
  try {
    const { data } = await apiReadJSON('data/events.json');
    const items = (data.items || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    select.innerHTML = '<option value="">Select an event...</option>' +
      items.map(e => `<option value="${e.title}">${e.title} — ${fmtDate(e.date)}</option>`).join('');
  } catch (_) {
    select.innerHTML = '<option value="">Could not load events — type the name below</option>';
  }
}

async function submitAttendance() {
  const selected   = document.getElementById('attendance-event-select').value;
  const custom     = document.getElementById('attendance-event-custom').value.trim();
  const eventName  = custom || selected;
  const date       = document.getElementById('attendance-date').value;
  const count      = document.getElementById('attendance-count').value;

  if (!eventName || !date || count === '') {
    showAlert('warning', 'Please select/enter an event, a date, and the number attended.');
    return;
  }

  const record = {
    event_name: eventName,
    event_date: date,
    attendees_count: parseInt(count) || 0,
    volunteer_name: document.getElementById('attendance-volunteer').value.trim() || null,
    notes: document.getElementById('attendance-notes').value.trim() || null
  };

  showLoading(editingAttendanceId ? 'Updating attendance...' : 'Saving attendance...');
  try {
    if (editingAttendanceId) {
      await apiCall('update_attendance', { id: editingAttendanceId, record });
    } else {
      await apiCall('add_attendance', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Attendance ${editingAttendanceId ? 'updated' : 'saved'}.`);
    cancelEditAttendance();
    loadAttendanceList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadAttendanceList() {
  const body = document.getElementById('attendance-list-body');
  body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_attendance');
    attendanceRows = Array.isArray(rows) ? rows : [];
    if (!attendanceRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No attendance logged yet.</td></tr>';
      return;
    }
    body.innerHTML = attendanceRows.map(r => `
      <tr>
        <td>${r.event_name}</td>
        <td>${fmtDate(r.event_date)}</td>
        <td>${r.attendees_count}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editAttendance(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteAttendance(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editAttendance(id) {
  const r = attendanceRows.find(x => x.id === id);
  if (!r) return;
  editingAttendanceId = id;

  const select = document.getElementById('attendance-event-select');
  const hasOption = Array.from(select.options).some(o => o.value === r.event_name);
  select.value = hasOption ? r.event_name : '';
  document.getElementById('attendance-event-custom').value = hasOption ? '' : r.event_name;
  document.getElementById('attendance-date').value      = r.event_date;
  document.getElementById('attendance-count').value     = r.attendees_count;
  document.getElementById('attendance-volunteer').value = r.volunteer_name || '';
  document.getElementById('attendance-notes').value     = r.notes || '';

  document.getElementById('attendance-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Attendance';
  document.getElementById('attendance-cancel-btn').style.display = 'inline-block';
  document.getElementById('attendance-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditAttendance() {
  editingAttendanceId = null;
  document.getElementById('attendance-form').reset();
  document.getElementById('attendance-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Attendance';
  document.getElementById('attendance-cancel-btn').style.display = 'none';
}

async function deleteAttendance(id) {
  if (!confirm('Delete this attendance record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_attendance', { id });
    showAlert('success', 'Attendance record deleted.');
    loadAttendanceList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function submitGrant() {
  const name   = document.getElementById('grant-name').value.trim();
  const amount = document.getElementById('grant-amount').value;
  const method = document.getElementById('grant-method').value;
  const date   = document.getElementById('grant-date').value;

  if (!name || amount === '' || !method || !date) {
    showAlert('warning', 'Please fill in grantor name, amount, payment method, and date received.');
    return;
  }

  const record = {
    grantor_name: name,
    amount: parseFloat(amount) || 0,
    payment_method: method,
    date_received: date,
    reference: document.getElementById('grant-reference').value.trim() || null,
    volunteer_name: document.getElementById('grant-volunteer').value.trim() || null,
    notes: document.getElementById('grant-notes').value.trim() || null
  };

  showLoading(editingGrantId ? 'Updating grant...' : 'Saving grant...');
  try {
    if (editingGrantId) {
      await apiCall('update_grant', { id: editingGrantId, record });
    } else {
      await apiCall('add_grant', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Grant ${editingGrantId ? 'updated' : 'saved'}.`);
    cancelEditGrant();
    loadGrantsList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadGrantsList() {
  const body = document.getElementById('grants-list-body');
  body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_grants');
    grantsRows = Array.isArray(rows) ? rows : [];
    if (!grantsRows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">No grants logged yet.</td></tr>';
      return;
    }
    body.innerHTML = grantsRows.map(r => `
      <tr>
        <td>${r.grantor_name}</td>
        <td>£${parseFloat(r.amount).toFixed(2)}</td>
        <td>${{ cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', other: 'Other' }[r.payment_method] || r.payment_method}</td>
        <td>${fmtDate(r.date_received)}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editGrant(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteGrant(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editGrant(id) {
  const r = grantsRows.find(x => x.id === id);
  if (!r) return;
  editingGrantId = id;

  document.getElementById('grant-name').value      = r.grantor_name;
  document.getElementById('grant-amount').value    = r.amount;
  document.getElementById('grant-method').value    = r.payment_method;
  document.getElementById('grant-date').value      = r.date_received;
  document.getElementById('grant-reference').value = r.reference || '';
  document.getElementById('grant-volunteer').value = r.volunteer_name || '';
  document.getElementById('grant-notes').value     = r.notes || '';

  document.getElementById('grant-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Grant';
  document.getElementById('grant-cancel-btn').style.display = 'inline-block';
  document.getElementById('grant-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditGrant() {
  editingGrantId = null;
  document.getElementById('grant-form').reset();
  document.getElementById('grant-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Grant';
  document.getElementById('grant-cancel-btn').style.display = 'none';
}

async function deleteGrant(id) {
  if (!confirm('Delete this grant record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_grant', { id });
    showAlert('success', 'Grant record deleted.');
    loadGrantsList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

async function submitFoodbank() {
  const date   = document.getElementById('foodbank-date').value;
  const people = document.getElementById('foodbank-people').value;

  if (!date || people === '') {
    showAlert('warning', 'Please fill in the date and number of people.');
    return;
  }

  const households = document.getElementById('foodbank-households').value;
  const record = {
    distribution_date: date,
    people_count: parseInt(people) || 0,
    households_count: households !== '' ? (parseInt(households) || 0) : null,
    volunteer_name: document.getElementById('foodbank-volunteer').value.trim() || null,
    notes: document.getElementById('foodbank-notes').value.trim() || null
  };

  showLoading(editingFoodbankId ? 'Updating foodbank record...' : 'Saving foodbank record...');
  try {
    if (editingFoodbankId) {
      await apiCall('update_foodbank', { id: editingFoodbankId, record });
    } else {
      await apiCall('add_foodbank', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Foodbank record ${editingFoodbankId ? 'updated' : 'saved'}.`);
    cancelEditFoodbank();
    loadFoodbankList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadFoodbankList() {
  const body = document.getElementById('foodbank-list-body');
  body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_foodbank');
    foodbankRows = Array.isArray(rows) ? rows : [];
    if (!foodbankRows.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-muted text-center py-3">No foodbank records yet.</td></tr>';
      return;
    }
    body.innerHTML = foodbankRows.map(r => `
      <tr>
        <td>${fmtDate(r.distribution_date)}</td>
        <td>${r.people_count}</td>
        <td>${r.households_count ?? '—'}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editFoodbank(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteFoodbank(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editFoodbank(id) {
  const r = foodbankRows.find(x => x.id === id);
  if (!r) return;
  editingFoodbankId = id;

  document.getElementById('foodbank-date').value       = r.distribution_date;
  document.getElementById('foodbank-people').value     = r.people_count;
  document.getElementById('foodbank-households').value = r.households_count ?? '';
  document.getElementById('foodbank-volunteer').value  = r.volunteer_name || '';
  document.getElementById('foodbank-notes').value      = r.notes || '';

  document.getElementById('foodbank-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Record';
  document.getElementById('foodbank-cancel-btn').style.display = 'inline-block';
  document.getElementById('foodbank-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditFoodbank() {
  editingFoodbankId = null;
  document.getElementById('foodbank-form').reset();
  document.getElementById('foodbank-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Foodbank Record';
  document.getElementById('foodbank-cancel-btn').style.display = 'none';
}

async function deleteFoodbank(id) {
  if (!confirm('Delete this foodbank record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_foodbank', { id });
    showAlert('success', 'Foodbank record deleted.');
    loadFoodbankList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

const ASSET_TYPE_LABELS = { purchased: 'Purchased', donated: 'Donated' };

async function submitAsset() {
  const name  = document.getElementById('asset-name').value.trim();
  const type  = document.getElementById('asset-type').value;
  const value = document.getElementById('asset-value').value;
  const date  = document.getElementById('asset-date').value;

  if (!name || !type || value === '' || !date) {
    showAlert('warning', 'Please fill in asset name, acquired by, value, and date acquired.');
    return;
  }

  const record = {
    asset_name: name,
    category: document.getElementById('asset-category').value || null,
    acquisition_type: type,
    value: parseFloat(value) || 0,
    date_acquired: date,
    source_name: document.getElementById('asset-source').value.trim() || null,
    condition: document.getElementById('asset-condition').value || null,
    volunteer_name: document.getElementById('asset-volunteer').value.trim() || null,
    notes: document.getElementById('asset-notes').value.trim() || null
  };

  showLoading(editingAssetId ? 'Updating asset...' : 'Saving asset...');
  try {
    if (editingAssetId) {
      await apiCall('update_asset', { id: editingAssetId, record });
    } else {
      await apiCall('add_asset', { record });
    }
    hideLoading();
    showAlert('success', `<i class="fas fa-check-circle"></i> Asset ${editingAssetId ? 'updated' : 'saved'}.`);
    cancelEditAsset();
    loadAssetsList();
  } catch (err) {
    hideLoading();
    showAlert('danger', err.message);
  }
}

async function loadAssetsList() {
  const body = document.getElementById('assets-list-body');
  body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">Loading...</td></tr>';
  try {
    const rows = await apiCall('list_asset');
    assetsRows = Array.isArray(rows) ? rows : [];
    if (!assetsRows.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted text-center py-3">No assets logged yet.</td></tr>';
      return;
    }
    body.innerHTML = assetsRows.map(r => `
      <tr>
        <td>${r.asset_name}</td>
        <td>${ASSET_TYPE_LABELS[r.acquisition_type] || r.acquisition_type}</td>
        <td>£${parseFloat(r.value).toFixed(2)}</td>
        <td>${fmtDate(r.date_acquired)}</td>
        <td>${r.volunteer_name || '—'}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary" onclick="editAsset(${r.id})"><i class="fas fa-pen"></i></button>
          ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteAsset(${r.id})"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="6" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

function editAsset(id) {
  const r = assetsRows.find(x => x.id === id);
  if (!r) return;
  editingAssetId = id;

  document.getElementById('asset-name').value      = r.asset_name;
  document.getElementById('asset-category').value   = r.category || '';
  document.getElementById('asset-type').value      = r.acquisition_type;
  document.getElementById('asset-value').value     = r.value;
  document.getElementById('asset-date').value      = r.date_acquired;
  document.getElementById('asset-source').value    = r.source_name || '';
  document.getElementById('asset-condition').value = r.condition || '';
  document.getElementById('asset-volunteer').value = r.volunteer_name || '';
  document.getElementById('asset-notes').value     = r.notes || '';

  document.getElementById('asset-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Asset';
  document.getElementById('asset-cancel-btn').style.display = 'inline-block';
  document.getElementById('asset-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelEditAsset() {
  editingAssetId = null;
  document.getElementById('asset-form').reset();
  document.getElementById('asset-submit-btn').innerHTML = '<i class="fas fa-save"></i> Save Asset';
  document.getElementById('asset-cancel-btn').style.display = 'none';
}

async function deleteAsset(id) {
  if (!confirm('Delete this asset record?\n\nThis cannot be undone.')) return;
  try {
    await apiCall('delete_asset', { id });
    showAlert('success', 'Asset record deleted.');
    loadAssetsList();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

/* ════════════════════════════════════════════════════════════
   VISITOR LOG
   ════════════════════════════════════════════════════════════ */

let allVisitorRows = [];

function initVisitorTab() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('v-date-from').value = today;
  document.getElementById('v-date-to').value   = today;
  loadVisitors();
}

async function loadVisitors() {
  const from = document.getElementById('v-date-from').value;
  const to   = document.getElementById('v-date-to').value;
  const tbody = document.getElementById('visitor-table-body');
  tbody.innerHTML = '<tr><td colspan="10" class="text-muted text-center py-4"><i class="fas fa-spinner fa-spin me-2"></i>Loading…</td></tr>';

  try {
    const data = await apiCall('list_visitors_range', { date_from: from, date_to: to });
    allVisitorRows = Array.isArray(data) ? data : [];
    renderVisitorTable(allVisitorRows);
    updateVisitorStats(allVisitorRows);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-danger text-center py-4">${err.message}</td></tr>`;
  }
}

function renderVisitorTable(rows) {
  const tbody = document.getElementById('visitor-table-body');
  document.getElementById('v-count').textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-muted text-center py-4">No visitor records for this date range.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(v => {
    const inTime  = v.signed_in_at  ? new Date(v.signed_in_at).toLocaleTimeString('en-GB',  { hour: '2-digit', minute: '2-digit' }) : '—';
    const outTime = v.signed_out_at ? new Date(v.signed_out_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
    const inDate  = v.signed_in_at  ? new Date(v.signed_in_at).toLocaleDateString('en-GB',  { day: 'numeric', month: 'short' }) : '';
    const isIn    = !v.signed_out_at;
    const statusBadge = isIn
      ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle"><i class="fas fa-circle-dot" style="font-size:8px"></i> In Building</span>'
      : '<span class="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle">Signed Out</span>';
    const signOutBtn = isIn
      ? `<button class="btn btn-outline-danger btn-sm" onclick="adminSignOut('${v.id}', '${v.first_name} ${v.last_name}')"><i class="fas fa-sign-out-alt"></i></button>`
      : '';
    return `<tr>
      <td><strong>${v.first_name} ${v.last_name}</strong></td>
      <td class="text-muted small">${v.organisation || '—'}</td>
      <td>${v.host_name}</td>
      <td><span class="badge bg-light text-dark border">${v.purpose}</span></td>
      <td class="small">${v.dbs_status || '—'}</td>
      <td><code>${v.badge_id || '—'}</code></td>
      <td class="small">${inDate} ${inTime}</td>
      <td class="small">${outTime}</td>
      <td>${statusBadge}</td>
      <td>${signOutBtn}</td>
    </tr>`;
  }).join('');
}

function updateVisitorStats(rows) {
  const today    = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(v => v.signed_in_at && v.signed_in_at.startsWith(today));
  const inBldg   = rows.filter(v => !v.signed_out_at);
  const signedOut = rows.filter(v =>  v.signed_out_at);
  const now      = new Date();
  const monthRows = rows.filter(v => {
    const d = new Date(v.signed_in_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  document.getElementById('vstat-today').textContent    = todayRows.length;
  document.getElementById('vstat-in').textContent       = inBldg.length;
  document.getElementById('vstat-month').textContent    = monthRows.length;
  document.getElementById('vstat-signedout').textContent = signedOut.length;
}

function filterVisitorTable() {
  const q = document.getElementById('v-search').value.toLowerCase();
  const filtered = allVisitorRows.filter(v =>
    `${v.first_name} ${v.last_name} ${v.organisation || ''} ${v.host_name} ${v.purpose}`.toLowerCase().includes(q)
  );
  renderVisitorTable(filtered);
}

async function adminSignOut(id, name) {
  if (!confirm(`Sign out ${name}?\n\nThis will record their departure time.`)) return;
  try {
    await apiCall('admin_signout_visitor', { id });
    showAlert('success', `${name} has been signed out.`);
    loadVisitors();
  } catch (err) {
    showAlert('danger', err.message);
  }
}

function exportVisitorsCsv() {
  if (!allVisitorRows.length) { showAlert('warning', 'No records to export.'); return; }
  const headers = ['First Name','Last Name','Organisation','Host','Purpose','DBS Status','Badge','Signed In','Signed Out'];
  const rows = allVisitorRows.map(v => [
    v.first_name, v.last_name, v.organisation || '', v.host_name, v.purpose,
    v.dbs_status || '', v.badge_id || '',
    v.signed_in_at  ? new Date(v.signed_in_at).toLocaleString('en-GB')  : '',
    v.signed_out_at ? new Date(v.signed_out_at).toLocaleString('en-GB') : ''
  ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = document.getElementById('v-date-from').value;
  a.href     = url;
  a.download = `joybringers-visitors-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

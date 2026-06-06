/* ============================================================
   Joybringers – Cookie Consent Manager
   Provides window.showCmpBanner() used by every page footer.
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'jb_cookie_consent';

  /* ── storage helpers ── */
  function getConsent() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }
  function saveConsent(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  /* ── inject stylesheet once ── */
  function injectStyles() {
    if (document.getElementById('jb-cmp-styles')) return;
    var s = document.createElement('style');
    s.id = 'jb-cmp-styles';
    s.textContent =
      '#jb-cmp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;}' +
      '#jb-cmp-wrap{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '#jb-cmp-modal{background:#fff;border-radius:14px;max-width:480px;width:100%;padding:32px 28px 24px;position:relative;box-shadow:0 24px 64px rgba(0,0,0,.28);}' +
      '#jb-cmp-modal h2{font-size:1.2rem;font-weight:700;color:#003d14;margin:0 0 10px;}' +
      '#jb-cmp-modal>p{font-size:.88rem;color:#444;margin:0 0 20px;line-height:1.55;}' +
      '#jb-cmp-close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.6rem;line-height:1;cursor:pointer;color:#888;padding:2px 8px;}' +
      '#jb-cmp-close:hover{color:#003d14;}' +
      '.jb-cmp-row{margin-bottom:12px;padding:12px 14px;background:#f4fcf7;border-radius:8px;border:1px solid #c8e8d3;}' +
      '.jb-cmp-row label{display:flex;align-items:center;gap:10px;font-weight:600;font-size:.88rem;color:#003d14;cursor:pointer;margin:0;}' +
      '.jb-cmp-row label span{flex:1;}' +
      '.jb-cmp-row small{display:block;font-size:.76rem;color:#555;margin-top:5px;padding-left:30px;line-height:1.45;}' +
      '.jb-cmp-row input[type=checkbox]{width:17px;height:17px;cursor:pointer;accent-color:#006526;flex-shrink:0;}' +
      '#jb-cmp-btns{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;}' +
      '#jb-cmp-save{flex:1;padding:11px 16px;background:#fff;border:2px solid #006526;color:#006526;border-radius:8px;font-weight:700;font-size:.88rem;cursor:pointer;transition:background .18s;}' +
      '#jb-cmp-save:hover{background:#f0fdf4;}' +
      '#jb-cmp-all{flex:1;padding:11px 16px;background:#006526;border:2px solid #006526;color:#fff;border-radius:8px;font-weight:700;font-size:.88rem;cursor:pointer;transition:background .18s;}' +
      '#jb-cmp-all:hover{background:#004d1a;}' +
      '#jb-cmp-icon{font-size:2rem;margin-bottom:10px;}';
    document.head.appendChild(s);
  }

  /* ── build and show the modal ── */
  function showBanner() {
    injectStyles();

    /* remove any existing instance */
    var existing = document.getElementById('jb-cmp-outer');
    if (existing) existing.remove();

    var outer = document.createElement('div');
    outer.id = 'jb-cmp-outer';

    var saved = getConsent() || {};

    outer.innerHTML =
      '<div id="jb-cmp-overlay"></div>' +
      '<div id="jb-cmp-wrap">' +
      '  <div id="jb-cmp-modal" role="dialog" aria-modal="true" aria-labelledby="jb-cmp-title">' +
      '    <button id="jb-cmp-close" aria-label="Close">&times;</button>' +
      '    <div id="jb-cmp-icon">&#127850;</div>' +
      '    <h2 id="jb-cmp-title">Cookie Settings</h2>' +
      '    <p>We use cookies to improve your experience on the Joybringers website. You can choose which types of cookies you allow below.</p>' +
      '    <div class="jb-cmp-row">' +
      '      <label><input type="checkbox" id="jb-ck-necessary" checked disabled>' +
      '        <span>Necessary Cookies</span></label>' +
      '      <small>Always on. Required for the website to function correctly — login sessions, forms, and security.</small>' +
      '    </div>' +
      '    <div class="jb-cmp-row">' +
      '      <label><input type="checkbox" id="jb-ck-analytics"' + (saved.analytics ? ' checked' : '') + '>' +
      '        <span>Analytics Cookies</span></label>' +
      '      <small>Help us understand how visitors use the site so we can improve it.</small>' +
      '    </div>' +
      '    <div class="jb-cmp-row">' +
      '      <label><input type="checkbox" id="jb-ck-marketing"' + (saved.marketing ? ' checked' : '') + '>' +
      '        <span>Marketing Cookies</span></label>' +
      '      <small>Used to show relevant content and measure the impact of our outreach.</small>' +
      '    </div>' +
      '    <div id="jb-cmp-btns">' +
      '      <button id="jb-cmp-save">Save My Choices</button>' +
      '      <button id="jb-cmp-all">Accept All</button>' +
      '    </div>' +
      '  </div>' +
      '</div>';

    document.body.appendChild(outer);

    function close() {
      var el = document.getElementById('jb-cmp-outer');
      if (el) el.remove();
    }

    document.getElementById('jb-cmp-close').addEventListener('click', close);
    document.getElementById('jb-cmp-overlay').addEventListener('click', close);

    document.getElementById('jb-cmp-save').addEventListener('click', function () {
      saveConsent({
        necessary: true,
        analytics: document.getElementById('jb-ck-analytics').checked,
        marketing: document.getElementById('jb-ck-marketing').checked,
        ts: Date.now()
      });
      close();
    });

    document.getElementById('jb-cmp-all').addEventListener('click', function () {
      saveConsent({ necessary: true, analytics: true, marketing: true, ts: Date.now() });
      close();
    });
  }

  /* ── expose globally for footer button onclick="window.showCmpBanner()" ── */
  window.showCmpBanner = showBanner;

  /* ── auto-show on first visit (no stored consent) ── */
  document.addEventListener('DOMContentLoaded', function () {
    if (!getConsent()) {
      setTimeout(showBanner, 900);
    }
  });

})();

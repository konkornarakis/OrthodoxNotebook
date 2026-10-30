// assets/site.js — θέμα (φωτεινό/σκοτεινό), κοινή κεφαλίδα και υποσέλιδο.
// Φορτώνεται στο <head> ώστε το θέμα να εφαρμόζεται πριν από την πρώτη σχεδίαση.

(function () {
  'use strict';

  function storedTheme() {
    try { return localStorage.getItem('themeMode'); } catch (e) { return null; }
  }
  function effectiveTheme() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const dark = effectiveTheme() === 'dark';
    btn.innerHTML = dark ? ICON_SUN : ICON_CANDLE;
    btn.title = dark ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα';
    btn.setAttribute('aria-label', btn.title);
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('themeMode', next); } catch (e) { /* ιδιωτική περιήγηση */ }
    applyTheme(next);
  }

  // Σκοτεινό θέμα: αναμμένο κερί
  const ICON_CANDLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6c1.5 1.8 2.3 3.2 2.3 4.4a2.3 2.3 0 0 1-4.6 0c0-1.2.8-2.6 2.3-4.4z" fill="currentColor" stroke="none"/><path d="M12 9.4v1.6"/><rect x="9.6" y="11" width="4.8" height="8.4" rx=".6"/><path d="M6.5 19.4h11M8.5 21.4h7"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';

  applyTheme(storedTheme());

  // Ελληνικός ισοσκελής σταυρός με τριφύλλια (όπως οι σταυροί ευλογίας), σε πλαίσιο 24×24
  const CROSS_SHAPES = '<rect x="10.7" y="3.5" width="2.6" height="17"/><rect x="3.5" y="10.7" width="17" height="2.6"/><circle cx="12" cy="12" r="2.15"/><circle cx="12" cy="2.2" r="1.6"/><circle cx="10.2" cy="3.75" r="1.3"/><circle cx="13.8" cy="3.75" r="1.3"/><circle cx="21.8" cy="12" r="1.6"/><circle cx="20.25" cy="10.2" r="1.3"/><circle cx="20.25" cy="13.8" r="1.3"/><circle cx="12" cy="21.8" r="1.6"/><circle cx="10.2" cy="20.25" r="1.3"/><circle cx="13.8" cy="20.25" r="1.3"/><circle cx="2.2" cy="12" r="1.6"/><circle cx="3.75" cy="10.2" r="1.3"/><circle cx="3.75" cy="13.8" r="1.3"/>';
  const SITE_CROSS =
    '<svg class="site-cross" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g fill="currentColor" transform="translate(17 17) scale(1.25)">' + CROSS_SHAPES + '</g>' +
      '<g fill="currentColor" font-family="GFS Didot, Georgia, serif" font-size="11.5" text-anchor="middle">' +
        '<text x="11" y="21">ΙΣ</text><text x="53" y="21">ΧΣ</text>' +
        '<text x="11" y="55">ΝΙ</text><text x="53" y="55">ΚΑ</text>' +
      '</g>' +
      '<path stroke="currentColor" stroke-width="1" d="M5.5 10.5h11M47.5 10.5h11"/>' +
    '</svg>';
  const SMALL_CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">' + CROSS_SHAPES + '</g></svg>';

  const EMAIL = 'konkornarakis@gmail.com';
  const PAGES = [
    { id: 'calendar',   href: 'main.html',       label: 'Νηστειοδρόμιο' },
    { id: 'synaxarion', href: 'synaxarion.html', label: 'Εορτολόγιο' },
    { id: 'readings',   href: 'anagnosmata.html', label: 'Αναγνώσματα' },
    { id: 'prayerbook', href: 'proseuxitario.html', label: 'Προσευχητάριο' },
    { id: 'fasting',    href: 'fasting.html',    label: 'Περί νηστείας' },
    { id: 'sermons',    href: 'sermons.html',    label: 'Ομιλίες' },
    { id: 'radio',      href: 'radio.html',      label: 'Ραδιόφωνο' },
  ];

  function renderChrome() {
    const header = document.querySelector('header[data-page]');
    if (header) {
      const page = header.getAttribute('data-page');
      const title = header.getAttribute('data-title') || '';
      const subtitle = header.getAttribute('data-subtitle') || '';
      const nav = PAGES.map(p =>
        '<a href="' + p.href + '"' + (p.id === page ? ' aria-current="page"' : '') + '>' + p.label + '</a>'
      ).join('<span class="sep" aria-hidden="true">◆</span>');
      header.classList.add('site-header');
      header.innerHTML =
        '<button id="theme-toggle" class="theme-toggle" type="button"></button>' +
        SITE_CROSS +
        '<a class="site-brand" href="main.html">Ορθόδοξο Σημειωματάριο</a>' +
        '<h1 class="site-title">' + title + '</h1>' +
        (subtitle ? '<p class="site-subtitle">' + subtitle + '</p>' : '') +
        '<div class="orn-divider">' + SMALL_CROSS + '</div>' +
        '<nav class="site-nav" aria-label="Κύρια πλοήγηση">' + nav + '</nav>';
      document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
      const current = header.querySelector('.site-nav [aria-current="page"]');
      if (current) { const nav = current.parentElement; nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2; }
      applyTheme(storedTheme());
    }

    const footer = document.querySelector('footer[data-site-footer]');
    if (footer) {
      footer.classList.add('site-footer');
      const extra = footer.innerHTML.trim();
      footer.innerHTML =
        '<div class="orn-divider">' + SMALL_CROSS + '</div>' +
        '<p class="footer-text">Η νηστεία κατά την κοινή πράξη της Εκκλησίας της Ελλάδος (νέο ημερολόγιο).</p>' +
        (extra ? '<p class="footer-text">' + extra + '</p>' : '') +
        '<p class="footer-text"><a href="efarmogi.html">Εφαρμογή και υπενθυμίσεις</a> · <a href="mailto:' + EMAIL + '">' + EMAIL + '</a></p>';
    }

    if (!document.querySelector('.orn-band')) {
      const band = document.createElement('div');
      band.className = 'orn-band';
      band.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(band, document.body.firstChild);
    }
  }

  // ── Εφαρμογή: λειτουργία χωρίς σύνδεση και εγκατάσταση ───────────────
  let installPrompt = null;
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();               // καμία αυτόματη προτροπή· μόνο όταν το ζητήσει ο ίδιος ο χρήστης
    installPrompt = e;
    document.dispatchEvent(new CustomEvent('ortho:installable'));
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.dispatchEvent(new CustomEvent('ortho:installed'));
  });
  async function install() {
    if (!installPrompt) return false;
    const p = installPrompt;
    installPrompt = null;
    p.prompt();
    try { const r = await p.userChoice; return r && r.outcome === 'accepted'; } catch (e) { return false; }
  }
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* χωρίς λειτουργία εκτός σύνδεσης */ });
  }

  function start() {
    renderChrome();
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.OrthoSite = {
    applyTheme, toggleTheme, SMALL_CROSS, CROSS_SHAPES,
    install, isStandalone, canInstall: () => !!installPrompt,
  };
})();

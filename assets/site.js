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
    btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    btn.title = dark ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα';
    btn.setAttribute('aria-label', btn.title);
  }
  function toggleTheme() {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('themeMode', next); } catch (e) { /* ιδιωτική περιήγηση */ }
    applyTheme(next);
  }

  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';

  applyTheme(storedTheme());

  // Βυζαντινός σταυρός με το ΙΣ ΧΣ ΝΙ ΚΑ
  const CROSS_PATH = 'M7.5 1h5l-1.3 7.8 7.8-1.3v5l-7.8-1.3 1.3 7.8h-5l1.3-7.8-7.8 1.3v-5l7.8 1.3z';
  const SITE_CROSS =
    '<svg class="site-cross" viewBox="0 0 64 64" aria-hidden="true">' +
      '<path fill="currentColor" transform="translate(17 17) scale(1.5)" d="' + CROSS_PATH + '"/>' +
      '<g fill="currentColor" font-family="GFS Didot, Georgia, serif" font-size="11.5" text-anchor="middle">' +
        '<text x="11" y="21">ΙΣ</text><text x="53" y="21">ΧΣ</text>' +
        '<text x="11" y="55">ΝΙ</text><text x="53" y="55">ΚΑ</text>' +
      '</g>' +
      '<path stroke="currentColor" stroke-width="1" d="M5.5 10.5h11M47.5 10.5h11"/>' +
    '</svg>';
  const SMALL_CROSS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="' + CROSS_PATH + '"/></svg>';

  const PAGES = [
    { id: 'calendar',   href: 'main.html',       label: 'Νηστειοδρόμιο' },
    { id: 'synaxarion', href: 'synaxarion.html', label: 'Εορτολόγιο' },
    { id: 'fasting',    href: 'fasting.html',    label: 'Περί νηστείας' },
    { id: 'sermons',    href: 'sermons.html',    label: 'Ομιλίες' },
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
      applyTheme(storedTheme());
    }

    const footer = document.querySelector('footer[data-site-footer]');
    if (footer) {
      footer.classList.add('site-footer');
      const extra = footer.innerHTML.trim();
      footer.innerHTML =
        '<div class="orn-divider">' + SMALL_CROSS + '</div>' +
        '<p class="footer-text">Οι κανόνες νηστείας ακολουθούν την κοινή πράξη της Εκκλησίας της Ελλάδος (νέο ημερολόγιο).<br>' +
        'Για την προσωπική σας νηστεία συμβουλευτείτε τον πνευματικό σας.</p>' +
        (extra ? '<p class="footer-text">' + extra + '</p>' : '') +
        '<p class="footer-text"><a href="mailto:konkornarakis@gmail.com">konkornarakis@gmail.com</a></p>';
    }

    if (!document.querySelector('.orn-band')) {
      const band = document.createElement('div');
      band.className = 'orn-band';
      band.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(band, document.body.firstChild);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderChrome);
  else renderChrome();

  window.OrthoSite = { applyTheme, toggleTheme, SMALL_CROSS };
})();

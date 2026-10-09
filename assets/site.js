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

  // ── Σημείωμα προς όποιον μπαίνει ──────────────────────────────────────
  const EMAIL = 'konkornarakis@gmail.com';
  const LETTER = [
    'Πριν προχωρήσεις, θέλω να σου πω με ειλικρίνεια ποιος γράφει όσα θα βρεις εδώ.',
    'Τίποτε από αυτά δεν το έγραψε ούτε το είπε κάποια Μητρόπολη, κάποιος Αρχιεπίσκοπος ή Επίσκοπος ή κάποιος ιερέας. ' +
      'Τα έγραψα εγώ, ένας απλός άνθρωπος, αμαρτωλός και εντελώς αρχάριος, που στην πραγματικότητα δεν ξέρει τίποτα. ' +
      'Προσπαθώ μόνο να μεταφέρω λίγα από όσα έχω διαβάσει από τους Πατέρες και από ανθρώπους της Εκκλησίας. ' +
      'Πολλά από τα κείμενα τα συγκέντρωσα και τα διατύπωσα με τη βοήθεια ενός προγράμματος τεχνητής νοημοσύνης, που κι αυτό κάνει λάθη.',
    'Δεν γράφω για να διδάξω κανέναν. Δεν θεωρώ ότι όλα όσα γράφονται εδώ είναι σωστά· μπορεί να έχουν λάθη, ακόμη και σε σοβαρά θέματα. ' +
      'Γι’ αυτό διάβασέ τα με επιφύλαξη, και για ό,τι αφορά τη δική σου ζωή (τη νηστεία, την προσευχή, τον κανόνα σου) ρώτα τον πνευματικό σου.',
    'Ούτε είμαι βέβαιος ότι αυτή η σελίδα θα σε ωφελήσει. Το κομποσκοίνι στην οθόνη και οι «διαδραστικές» ασκήσεις δεν τα θεωρώ ούτε ιδανικό ούτε σωστό τρόπο. ' +
      'Ένα αληθινό κομποσκοίνι και η προσευχή μακριά από οθόνες είναι πολύ καλύτερα. Αν όμως κάτι από εδώ σε βοηθήσει, δόξα τω Θεώ.',
    'Και κάτι ακόμη, που για μένα μετράει πολύ. Ξέρω από τον εαυτό μου πόσο εύκολα μας τραβάει μια όμορφη οθόνη. ' +
      'Μπαίνω μηχανικά σε σελίδες ειδήσεων που δεν θα έπρεπε καν να διαβάζω, μόνο επειδή είναι καλοφτιαγμένες, ενώ θα μπορούσα να προσεύχομαι. ' +
      'Πολλές σελίδες και εφαρμογές, όπως το Facebook, είναι μελετημένες επίτηδες για να μας τραβούν και να μας κρατούν. ' +
      'Δεν θέλω να γίνει και αυτή η σελίδα κάτι τέτοιο. Αν δεις ότι μπαίνεις εδώ χωρίς λόγο, μόνο επειδή είναι «ωραία», κλείσ’ την. ' +
      'Έλα μόνο για ό,τι χρειάζεσαι, και ύστερα άφησε την οθόνη.',
    'Αν βρεις κάποιο λάθος, θα σου είμαι ευγνώμων αν μου το γράψεις στο <a href="mailto:' + EMAIL + '">' + EMAIL + '</a>.',
  ];
  const LETTER_SIGN = 'Εύχου και για μένα τον αμαρτωλό.';
  const NOTICE_SHORT = 'Αδελφέ, όσα βρίσκεις εδώ τα έγραψε ένας απλός, αμαρτωλός άνθρωπος, όχι η Εκκλησία. ' +
    'Μπορεί να έχουν λάθη· διάβασέ τα με επιφύλαξη και ρώτα τον πνευματικό σου. <a href="simeioma.html">Το σημείωμα</a>';
  const NOTICE_EVERY_DAYS = 7;
  function letterHtml() {
    return LETTER.map(p => '<p>' + p + '</p>').join('') + '<p class="letter-sign">' + LETTER_SIGN + '</p>';
  }

  const PAGES = [
    { id: 'calendar',   href: 'main.html',       label: 'Νηστειοδρόμιο' },
    { id: 'synaxarion', href: 'synaxarion.html', label: 'Εορτολόγιο' },
    { id: 'prayer',     href: 'prayer.html',     label: 'Νοερά προσευχή' },
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
        '<nav class="site-nav" aria-label="Κύρια πλοήγηση">' + nav + '</nav>' +
        (page === 'note' ? '' : '<p class="site-notice">' + NOTICE_SHORT + '</p>');
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
        '<p class="footer-text">Κείμενα ενός απλού, αμαρτωλού ανθρώπου, όχι Μητρόπολης ή ιερέα· μπορεί να έχουν λάθη. ' +
        '<a href="simeioma.html">Διάβασε το σημείωμα</a>.</p>' +
        '<p class="footer-text">Οι κανόνες νηστείας προσπαθούν να ακολουθούν την κοινή πράξη της Εκκλησίας της Ελλάδος (νέο ημερολόγιο). ' +
        'Για τη δική σου νηστεία ρώτα τον πνευματικό σου.</p>' +
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

  // ── Το σημείωμα: πρώτα σε όποιον μπαίνει, και ξανά κάθε λίγες ημέρες ────
  function noticeAcked() {
    try {
      const t = Number(localStorage.getItem('noticeAck')) || 0;
      return t && Date.now() - t < NOTICE_EVERY_DAYS * 86400000;
    } catch (e) { return false; }
  }
  function ackNotice() { try { localStorage.setItem('noticeAck', String(Date.now())); } catch (e) { /* ιδιωτική περιήγηση */ } }

  function showNotice() {
    const root = document.querySelector('.ort-root');
    const ov = document.createElement('div');
    ov.className = 'notice-overlay';
    ov.innerHTML =
      '<div class="notice-card" role="dialog" aria-modal="true" aria-labelledby="notice-title" tabindex="-1">' +
        '<h2 class="notice-title" id="notice-title">Αδελφέ,</h2>' +
        '<div class="letter">' + letterHtml() + '</div>' +
        '<div class="notice-actions"><button type="button" class="btn btn-accent" id="notice-ok">Το κατάλαβα · συνεχίζω με προσοχή</button></div>' +
        '<p class="notice-later">Μπορείς να το ξαναδιαβάσεις όποτε θέλεις στο <a href="simeioma.html">«Σημείωμα»</a>.</p>' +
      '</div>';
    document.body.appendChild(ov);
    document.documentElement.dataset.notice = 'open';
    document.body.classList.add('no-scroll');
    if (root) { root.inert = true; root.setAttribute('aria-hidden', 'true'); }
    const card = ov.querySelector('.notice-card');
    card.focus({ preventScroll: true });
    ov.querySelector('#notice-ok').addEventListener('click', () => {
      ackNotice();
      ov.remove();
      delete document.documentElement.dataset.notice;
      document.body.classList.remove('no-scroll');
      if (root) { root.inert = false; root.removeAttribute('aria-hidden'); }
    });
  }

  // ── Ήπια υπενθύμιση χρόνου: όχι την ώρα της προσευχής ────────────────────
  const TIME_STEP = 20 * 60;   // κάθε 20 λεπτά οθόνης την ημέρα
  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function readTime() {
    try {
      const o = JSON.parse(localStorage.getItem('screenTime') || '{}');
      if (o.d === today()) return o;
    } catch (e) { /* χωρίς αποθήκευση */ }
    return { d: today(), s: 0, shown: 0 };
  }
  function showTimeCard(minutes) {
    if (document.querySelector('.time-card')) return;
    const card = document.createElement('div');
    card.className = 'time-card';
    card.setAttribute('role', 'status');
    card.innerHTML = '<p>Αδελφέ, σήμερα είσαι εδώ πάνω από ' + minutes + ' λεπτά. Μήπως ήρθε η ώρα να αφήσεις την οθόνη;</p>' +
      '<button type="button" class="btn">Εντάξει</button>';
    card.querySelector('button').addEventListener('click', () => card.remove());
    document.body.appendChild(card);
  }
  function tickTime() {
    if (document.visibilityState !== 'visible') return;
    const html = document.documentElement;
    if (html.dataset.praying || html.dataset.notice === 'open') return;   // την ώρα της προσευχής δεν μετράμε ούτε διακόπτουμε
    const t = readTime();
    t.s += 10;
    if (t.s >= (t.shown + 1) * TIME_STEP) {
      t.shown = Math.floor(t.s / TIME_STEP);
      showTimeCard(t.shown * TIME_STEP / 60);
    }
    try { localStorage.setItem('screenTime', JSON.stringify(t)); } catch (e) { /* χωρίς αποθήκευση */ }
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
    const isNotePage = !!document.querySelector('header[data-page="note"]');
    document.querySelectorAll('[data-letter]').forEach(el => { el.innerHTML = letterHtml(); });
    if (isNotePage) ackNotice();
    else if (!noticeAcked()) showNotice();
    setInterval(tickTime, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.OrthoSite = {
    applyTheme, toggleTheme, SMALL_CROSS, CROSS_SHAPES,
    install, isStandalone, canInstall: () => !!installPrompt,
  };
})();

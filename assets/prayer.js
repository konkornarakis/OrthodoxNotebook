// assets/prayer.js — άσκηση της ευχής του Ιησού
//
// Τρεις τρόποι:
//  • «Με τα χείλη»: λέμε την ευχή χαμηλόφωνα και πατάμε έναν κόμπο σε κάθε ευχή.
//  • «Με την αναπνοή μου»: κρατάμε πατημένο όσο εισπνέουμε και αφήνουμε όσο εκπνέουμε·
//    η σελίδα ακολουθεί τη δική μας αναπνοή και μαθαίνει τον ρυθμό μας.
//  • «Με οδηγό»: η σελίδα δίνει έναν ήρεμο, σταθερό ρυθμό.
// Το κείμενο φωτίζεται με ένα συνεχές «φως» που περνά πάνω από τις λέξεις,
// το καντήλι ανεβαίνει και χαμηλώνει με την αναπνοή και, προαιρετικά,
// ένα ίσο (ισοκράτημα) ακολουθεί την αναπνοή για όποιον προσεύχεται με κλειστά μάτια.

(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const nowS = () => performance.now() / 1000;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ease = x => .5 - .5 * Math.cos(Math.PI * clamp(x, 0, 1));
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ── Κείμενα ─────────────────────────────────────────────────────────────
  // Κάθε ευχή χωρίζεται σε [εισπνοή, εκπνοή], σε πολυτονικό και μονοτονικό.
  const FORMS = {
    full:  { label: 'Κύριε Ἰησοῦ Χριστέ, Υἱὲ τοῦ Θεοῦ, ἐλέησόν με τὸν ἁμαρτωλόν',
             poly: ['Κύριε Ἰησοῦ Χριστέ, Υἱὲ τοῦ Θεοῦ,', 'ἐλέησόν με τὸν ἁμαρτωλόν.'],
             mono: ['Κύριε Ιησού Χριστέ, Υιέ του Θεού,', 'ελέησόν με τον αμαρτωλόν.'] },
    short: { label: 'Κύριε Ἰησοῦ Χριστέ, ἐλέησόν με',
             poly: ['Κύριε Ἰησοῦ Χριστέ,', 'ἐλέησόν με.'],
             mono: ['Κύριε Ιησού Χριστέ,', 'ελέησόν με.'] },
    sinai: { label: 'Ἰησοῦ, Υἱὲ τοῦ Θεοῦ, ἐλέησόν με (Άγ. Γρηγόριος Σιναΐτης)',
             poly: ['Ἰησοῦ, Υἱὲ τοῦ Θεοῦ,', 'ἐλέησόν με.'],
             mono: ['Ιησού, Υιέ του Θεού,', 'ελέησόν με.'] },
    theotokos: { label: 'Ὑπεραγία Θεοτόκε, σῶσον ἡμᾶς',
             poly: ['Ὑπεραγία Θεοτόκε,', 'σῶσον ἡμᾶς.'],
             mono: ['Υπεραγία Θεοτόκε,', 'σώσον ημάς.'] },
    other: { label: 'Για άλλον: Κύριε Ἰησοῦ Χριστέ, ἐλέησον τὸν δοῦλόν σου…' },
  };
  const OPENING = {
    poly: 'Δι᾿ εὐχῶν τῶν ἁγίων Πατέρων ἡμῶν, Κύριε Ἰησοῦ Χριστέ, ὁ Θεὸς ἡμῶν, ἐλέησον ἡμᾶς. Ἀμήν.',
    mono: 'Δι’ ευχών των αγίων Πατέρων ημών, Κύριε Ιησού Χριστέ, ο Θεός ημών, ελέησον ημάς. Αμήν.',
  };
  const CLOSING = {
    poly: ['Δόξα σοι, ὁ Θεός.', 'Δι᾿ εὐχῶν τῶν ἁγίων Πατέρων ἡμῶν, Κύριε Ἰησοῦ Χριστέ, ὁ Θεὸς ἡμῶν, ἐλέησον καὶ σῶσον ἡμᾶς. Ἀμήν.'],
    mono: ['Δόξα σοι, ο Θεός.', 'Δι’ ευχών των αγίων Πατέρων ημών, Κύριε Ιησού Χριστέ, ο Θεός ημών, ελέησον και σώσον ημάς. Αμήν.'],
  };

  // ── Ρυθμοί του οδηγού (δευτερόλεπτα): εισπνοή, παύση, εκπνοή, παύση ────────
  const PACES = {
    natural: { label: 'Φυσικός', in: 3,   hi: .2, out: 4,   ho: .5 },
    calm:    { label: 'Ήρεμος',  in: 4,   hi: .4, out: 5,   ho: .6 },
    slow:    { label: 'Αργός',   in: 5,   hi: .6, out: 6.5, ho: .9 },
  };

  const MODE_HINTS = {
    lips: 'Πείτε την ευχή χαμηλόφωνα, αργά, προσέχοντας μόνο τα λόγια. Σε κάθε ευχή πατήστε «Επόμενος κόμπος»' +
          (finePointer ? ' ή το πλήκτρο κενό.' : ' ή το ίδιο το κομποσκοίνι.'),
    mine: 'Κρατήστε πατημένο το κουμπί' + (finePointer ? ' (ή το κενό)' : '') +
          ' όσο εισπνέετε λέγοντας το πρώτο μέρος και αφήστε το όσο εκπνέετε λέγοντας το δεύτερο. Η σελίδα ακολουθεί τη δική σας αναπνοή και μαθαίνει τον ρυθμό σας.',
    guide: 'Το καντήλι ανεβαίνει στην εισπνοή και χαμηλώνει στην εκπνοή. Ακολουθήστε το χωρίς βία· αν ο ρυθμός δεν σας ταιριάζει, αλλάξτε τον στις ρυθμίσεις ή διαλέξτε «Με την αναπνοή μου».',
  };

  // ── Ρυθμίσεις (μένουν στη συσκευή) ──────────────────────────────────────
  const DEFAULTS = {
    v: 2, mode: 'mine', eyes: false, form: 'full', mono: false, gender: 'm', name: '',
    pace: 'natural', custom: null, prep: true, rule: '100',
    ison: false, tick: false, bell: true, vol: .6, vibKnot: true, vibPhase: false,
  };
  let opts = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem('prayerOpts') || '{}');
    if (saved && !saved.v) {
      // ρυθμίσεις της πρώτης έκδοσης της σελίδας
      if (saved.mode === 'rope') saved.mode = 'lips';
      else if (saved.mode === 'silent') { saved.mode = 'mine'; saved.eyes = true; saved.ison = true; }
      else saved.mode = 'mine';
      saved.pace = { mid: 'calm', fast: 'natural', slow: 'slow', custom: 'custom' }[saved.pace] || 'natural';
      if (saved.sound === 'off') { saved.bell = false; saved.tick = false; }
      if (saved.sound === 'knot') saved.tick = true;
      if ('vibrate' in saved) saved.vibKnot = !!saved.vibrate;
      delete saved.sound; delete saved.vibrate;
      saved.v = 2;
    }
    Object.assign(opts, saved);
  } catch (e) { /* χωρίς αποθήκευση */ }
  if (!['lips', 'mine', 'guide'].includes(opts.mode)) opts.mode = 'mine';
  if (!PACES[opts.pace] && opts.pace !== 'custom') opts.pace = 'natural';
  function save() { try { localStorage.setItem('prayerOpts', JSON.stringify(opts)); } catch (e) { /* χωρίς αποθήκευση */ } }

  function pace() { return opts.pace === 'custom' && opts.custom ? opts.custom : PACES[opts.pace] || PACES.natural; }
  function ropeSize() { return opts.rule === '33' ? 33 : opts.rule === '50' ? 50 : 100; }
  function target() { return /^\d+$/.test(opts.rule) ? Number(opts.rule) : null; }
  function timeLimit() { return opts.rule[0] === 't' ? Number(opts.rule.slice(1)) * 60 : null; }
  function prayerLines() {
    if (opts.form === 'other') {
      const name = (opts.name || '').trim() || '…';
      const f = opts.gender === 'f';
      return opts.mono
        ? ['Κύριε Ιησού Χριστέ,', (f ? 'ελέησον την δούλην σου ' : 'ελέησον τον δούλόν σου ') + name + '.']
        : ['Κύριε Ἰησοῦ Χριστέ,', (f ? 'ἐλέησον τὴν δούλην σου ' : 'ἐλέησον τὸν δοῦλόν σου ') + name + '.'];
    }
    const F = FORMS[opts.form] || FORMS.full;
    return opts.mono ? F.mono : F.poly;
  }

  // ── Κατάσταση ───────────────────────────────────────────────────────────
  let count = 0, elapsed = 0, finished = false, active = false;
  let b = .3;                         // «αναπνοή» 0..1: καντήλι και ίσο
  let phase = 'idle';                 // idle | in | hin | out | hout | rest
  let textKind = '';                  // opening | prayer | closing
  // οδηγός
  let guideOn = false, cycleT = 0, prepLeft = 0;
  // η αναπνοή μου
  let holding = false, tIn0 = 0, tOut0 = 0, tRest0 = -99, b0 = 0, b1 = 0, f1Start = 1, pending = false;
  let expIn = 3.5, expOut = 4.5, samples = 0;
  const hist = { in: [], out: [] };
  let advice = '', adviceUntil = 0;
  // με τα χείλη
  let tTap = -99, lastActivity = -99;
  // γενικά
  let immersive = false, lastFrame = 0, wakeLock = null;

  if (opts.custom) { expIn = opts.custom.in; expOut = opts.custom.out + opts.custom.hi; }

  // ── Στοιχεία σελίδας ────────────────────────────────────────────────────
  const practice = $('practice'), stage = $('stage'), ptext = $('prayer-text');
  const lines = [$('pl0'), $('pl1')];
  const sweeps = lines.map(l => l.querySelector('.sweep'));

  // ── Χρώματα για το «φως» πάνω στις λέξεις ───────────────────────────────
  let COL = null;
  function parseColor(s) {
    s = (s || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return m[1].split('').map(h => parseInt(h + h, 16));
    m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = /rgba?\(([^)]+)\)/i.exec(s);
    if (m) return m[1].split(',').slice(0, 3).map(x => parseFloat(x));
    return [60, 40, 20];
  }
  function refreshColors() {
    const cs = getComputedStyle(ptext);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches) || immersive;
    COL = { ink: parseColor(cs.getPropertyValue('--ink')), glow: parseColor(cs.getPropertyValue('--cinnabar')), dim: dark ? .3 : .26 };
  }
  function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`; }
  function mix(c1, c2, k) { return [0, 1, 2].map(i => c1[i] + (c2[i] - c1[i]) * k); }

  // Κατάσταση μιας γραμμής: { s: πρόοδος του φωτός 0..1 } ή { f: σβήσιμο 0..1, g: λάμψη 0..1 }
  const SOLID = (f, g) => ({ f: clamp(f, 0, 1), g: g || 0 });
  const SWEEP = s => ({ s: clamp(s, 0, 1) });
  const EDGE = reducedMotion ? .45 : .16;
  function paintLine(el, st) {
    const past = rgba(COL.ink, 1), fut = rgba(COL.ink, COL.dim), glow = rgba(COL.glow, 1);
    if (st.s !== undefined) {
      const x = -EDGE + st.s * (1 + 2 * EDGE);
      el.style.backgroundImage = `linear-gradient(90deg, ${past} ${((x - EDGE) * 100).toFixed(2)}%, ${glow} ${(x * 100).toFixed(2)}%, ${fut} ${((x + EDGE) * 100).toFixed(2)}%)`;
    } else {
      const a = 1 + (COL.dim - 1) * st.f;                      // από «ειπωμένο» σε «αμυδρό»
      const c = st.g ? mix(COL.ink, COL.glow, st.g) : COL.ink;
      const col = rgba(c, Math.max(a, st.g));
      el.style.backgroundImage = `linear-gradient(${col}, ${col})`;
    }
  }

  // ── Κείμενο στη σκηνή ───────────────────────────────────────────────────
  let swapTimer = 0;
  function setText(kind, instant) {
    const apply = () => {
      textKind = kind;
      const [a, z] = textFor(kind);
      sweeps[0].textContent = a;
      sweeps[1].textContent = z;
      ptext.classList.toggle('opening', kind === 'opening');
      ptext.classList.toggle('closing', kind === 'closing');
      ptext.classList.toggle('eyes', opts.eyes && opts.mode !== 'lips' && kind === 'prayer');
      ptext.classList.remove('fading');
      if (typeof renderControls === 'function' && practice.dataset.ready) renderControls();
    };
    clearTimeout(swapTimer);
    if (instant || reducedMotion) { apply(); return; }
    ptext.classList.add('fading');
    swapTimer = setTimeout(apply, 260);
  }
  // Κρατάμε σταθερό ύψος για το κείμενο, ώστε να μη μετακινείται τίποτα κάτω από το δάχτυλο
  function textFor(kind) {
    if (kind === 'opening') return [opts.mono ? OPENING.mono : OPENING.poly, ''];
    if (kind === 'closing') return opts.mono ? CLOSING.mono : CLOSING.poly;
    return prayerLines();
  }
  function reserveTextHeight() {
    const w = ptext.clientWidth;
    if (!w) return;
    const probe = ptext.cloneNode(true);
    probe.removeAttribute('id');
    probe.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:${w}px;min-height:0;transition:none`;
    probe.classList.remove('fading', 'eyes');
    stage.appendChild(probe);
    let max = 0;
    for (const kind of ['opening', 'prayer', 'closing']) {
      const [a, z] = textFor(kind);
      const sw = probe.querySelectorAll('.sweep');
      sw[0].textContent = a; sw[1].textContent = z;
      probe.classList.toggle('opening', kind === 'opening');
      probe.classList.toggle('closing', kind === 'closing');
      max = Math.max(max, probe.offsetHeight);
    }
    probe.remove();
    ptext.style.minHeight = Math.ceil(max) + 'px';
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(reserveTextHeight, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveTextHeight);

  function initialText() { return opts.prep && count === 0 && !finished ? 'opening' : finished ? 'closing' : 'prayer'; }

  // ── Κομποσκοίνι ─────────────────────────────────────────────────────────
  const CX = 200, CY = 190, R = 150, GAP = 13;
  const CROSS_PATH = 'M7.5 1h5l-1.3 7.8 7.8-1.3v5l-7.8-1.3 1.3 7.8h-5l1.3-7.8-7.8 1.3v-5l7.8 1.3z';
  let knotR = 4, ringC = 1, knotEls = [];
  function knotPos(i, n) {
    const a = (90 + GAP + (360 - 2 * GAP) * (i + .5) / n) * Math.PI / 180;
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  }
  function buildRope() {
    const n = ropeSize();
    const spacing = 2 * Math.PI * R * (360 - 2 * GAP) / 360 / n;
    knotR = Math.max(2.6, Math.min(8, spacing * .36));
    const beadEvery = n === 100 ? 25 : n === 50 ? 10 : 0;
    let knots = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = knotPos(i, n);
      knots += `<circle class="knot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${knotR.toFixed(2)}"/>`;
      if (beadEvery && (i + 1) % beadEvery === 0 && i < n - 1) {
        const [bx, by] = knotPos(i + .5, n);
        knots += `<circle class="bead" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(knotR * .9).toFixed(2)}"/>`;
      }
    }
    const bottom = CY + R, L = CY + 12;
    let tassel = '';
    for (let k = -5; k <= 5; k++) tassel += `<path class="tassel" d="M${CX + k * .6} ${bottom + 46} q ${k * 1.6} 22 ${k * 2.6} 48"/>`;
    const rr = knotR + 4.5;
    ringC = 2 * Math.PI * rr;
    $('rope').innerHTML = `
      <defs>
        <radialGradient id="glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset=".45" stop-color="#f0a83a" stop-opacity=".35"/><stop offset="1" stop-color="#f0a83a" stop-opacity="0"/></radialGradient>
        <linearGradient id="flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2672c"/><stop offset=".55" stop-color="#f6b13d"/><stop offset="1" stop-color="#fff2c4"/></linearGradient>
      </defs>
      <circle class="cord" cx="${CX}" cy="${CY}" r="${R}"/>
      ${knots}
      <circle class="kring" id="kring" r="${rr.toFixed(2)}" cx="${CX}" cy="${CY - R}" stroke-dasharray="${ringC.toFixed(2)}" stroke-dashoffset="${ringC.toFixed(2)}"/>
      <path class="cord" d="M${CX} ${bottom} v14"/>
      <path class="cross" transform="translate(${CX - 15} ${bottom + 12}) scale(1.5)" d="${CROSS_PATH}"/>
      ${tassel}
      <g class="lamp">
        <circle class="lamp-glow" cx="${CX}" cy="${L - 22}" r="82" fill="url(#glow)"/>
        <path class="lamp-chain" d="M${CX - 34} ${L} L${CX} ${L - 110} L${CX + 34} ${L} M${CX} ${L - 110} V${L - 124}"/>
        <path class="lamp-cup" d="M${CX - 34} ${L} h68 c 0 30 -14 52 -34 56 c -20 -4 -34 -26 -34 -56z"/>
        <path class="lamp-flame" d="M${CX} ${L - 44} c 10 14 13 24 13 32 a 13 13 0 0 1 -26 0 c 0 -8 3 -18 13 -32z" fill="url(#flame)"/>
        <path class="lamp-rim" d="M${CX - 34} ${L} h68"/>
      </g>`;
    knotEls = [...$('rope').querySelectorAll('.knot')];
    paintKnots();
  }
  function paintKnots() {
    const n = ropeSize(), pos = count % n, full = count > 0 && pos === 0;
    knotEls.forEach((el, i) => {
      el.classList.toggle('done', full || i < pos);
      el.classList.toggle('cur', !full && i === pos && !finished && (count > 0 || active));
    });
    const ring = $('kring');
    if (ring) {
      const [x, y] = knotPos(full ? n - 1 : pos, n);
      ring.setAttribute('cx', x.toFixed(1));
      ring.setAttribute('cy', y.toFixed(1));
    }
  }
  function isBead(c, n) { return c % n === 0 || (n === 100 && c % 25 === 0) || (n === 50 && c % 10 === 0); }

  // ── Πρόοδος ─────────────────────────────────────────────────────────────
  function advance() {
    if (finished) return;
    count++;
    bumpToday();
    const n = ropeSize(), bead = isBead(count, n);
    if (opts.vibKnot && navigator.vibrate) navigator.vibrate(bead ? [35, 70, 35] : 15);
    if (opts.tick) knock(bead);
    paintKnots();
    const t = target();
    if (t && count >= t) finish();
  }
  function begin() {
    if (finished) reset();
    if (!active) { active = true; requestWake(); announce('Η άσκηση ξεκίνησε.'); }
    unlockAudio();
  }
  function finish() {
    finished = true; guideOn = false; holding = false; pending = false; phase = 'idle';
    active = false;
    releaseWake();
    stopIson();
    if (opts.bell) bell();
    if (opts.vibKnot && navigator.vibrate) navigator.vibrate([80, 120, 80, 120, 160]);
    paintKnots();
    setText('closing');
    renderControls();
    announce('Ο κανόνας ολοκληρώθηκε. Δόξα σοι, ο Θεός.');
  }
  function reset() {
    count = 0; elapsed = 0; finished = false; active = false;
    guideOn = false; cycleT = 0; prepLeft = 0; phase = 'idle';
    holding = false; pending = false; tRest0 = -99; tTap = -99; b = .3;
    stopIson(); releaseWake();
    buildRope();
    setText(initialText(), true);
    renderControls();
  }

  // ── Τρόπος «Με οδηγό» ───────────────────────────────────────────────────
  function guideToggle() {
    if (finished) reset();
    if (guideOn) {
      guideOn = false; releaseWake(); stopIson();
      announce('Παύση.');
    } else {
      begin();
      guideOn = true; cycleT = 0;
      if (textKind === 'opening') prepLeft = 2;
    }
    renderControls();
  }
  function guideFrame(dt) {
    const p = pace(), T = p.in + p.hi + p.out + p.ho;
    if (!guideOn) {
      b += (.32 - b) * Math.min(1, dt * 2);
      return { l0: SOLID(0), l1: SOLID(0), q: null, label: count && !finished ? 'Παύση' : '' };
    }
    elapsed += dt;
    cycleT += dt;
    while (cycleT >= T) {
      cycleT -= T;
      if (prepLeft > 0) { prepLeft--; if (!prepLeft) setText('prayer'); }
      else { advance(); if (finished) return { l0: SOLID(0), l1: SOLID(0), q: null, label: '' }; }
    }
    const t = cycleT;
    let ph, u = 0;
    if (t < p.in) { ph = 'in'; u = t / p.in; b = ease(u); }
    else if (t < p.in + p.hi) { ph = 'hin'; b = 1; }
    else if (t < p.in + p.hi + p.out) { ph = 'out'; u = (t - p.in - p.hi) / p.out; b = 1 - ease(u); }
    else { ph = 'hout'; b = 0; }
    if (ph !== phase) {
      if (opts.vibPhase && navigator.vibrate) { if (ph === 'in') navigator.vibrate(25); if (ph === 'out') navigator.vibrate([12, 50, 12]); }
      phase = ph;
    }
    if (prepLeft > 0) return { l0: SOLID(0), l1: SOLID(0), q: null, label: 'Προετοιμασία' };
    const outFrac = clamp((t - p.in - p.hi) / (p.out + p.ho), 0, 1);
    let l0, l1;
    if (ph === 'in') { l0 = SWEEP(u); l1 = SOLID(Math.min(1, u * 1.8)); }
    else if (ph === 'hin') { l0 = SOLID(0); l1 = SOLID(1); }
    else if (ph === 'out') { l0 = SOLID(outFrac); l1 = SWEEP(u); }
    else { l0 = SOLID(outFrac); l1 = SOLID(0); }
    return { l0, l1, q: t / T, label: ph === 'in' || ph === 'hin' ? 'Εισπνοή' : 'Εκπνοή' };
  }

  // ── Τρόπος «Με την αναπνοή μου» ─────────────────────────────────────────
  function lineFade1(now) {
    // πόσο έχει σβήσει η δεύτερη γραμμή όταν αρχίζει νέα εισπνοή
    if (phase === 'rest') return clamp((now - tRest0 - 1.2) / 1.5, 0, 1);
    if (phase === 'out') return .5;
    return textKind === 'prayer' && count === 0 ? 0 : 1;
  }
  function holdStart() {
    if (holding) return;
    const now = nowS();
    begin();
    holding = true;
    if (phase === 'out' || phase === 'rest') {
      const outDur = now - tOut0;
      if (pending && outDur >= .8) { pending = false; learn('out', outDur); advance(); if (finished) { holding = false; return; } }
      else if (!pending && outDur < 15) learn('out', outDur);
      pending = false;
    }
    f1Start = lineFade1(now);
    if (textKind !== 'prayer') { setText('prayer', true); f1Start = 0; }
    phase = 'in'; tIn0 = now; b0 = b;
    renderControls();
  }
  function holdEnd() {
    if (!holding) return;
    holding = false;
    const now = nowS(), inDur = now - tIn0;
    if (inDur < .35) {
      // πολύ σύντομο πάτημα: δεν ήταν αναπνοή
      phase = count ? 'rest' : 'idle'; tRest0 = now - 5;
      say('Κρατήστε πατημένο όσο διαρκεί η εισπνοή, και αφήστε στην εκπνοή.', 4);
      renderControls();
      return;
    }
    learn('in', inDur);
    phase = 'out'; tOut0 = now; b1 = b; pending = true;
    renderControls();
  }
  function learn(kind, d) {
    if (kind === 'in') {
      if (d < 1.4) say('Λίγο πιο αργά· η ευχή δεν βιάζεται.', 5);
      else if (d > 8.5) say('Μην κρατάτε την αναπνοή· αφήστε τη να κυλά φυσικά.', 6);
    }
    const v = clamp(d, kind === 'in' ? 1.2 : 1.5, kind === 'in' ? 10 : 14);
    const h = hist[kind];
    h.push(v); if (h.length > 12) h.shift();
    if (kind === 'in') expIn = samples ? expIn * .65 + v * .35 : v;
    else expOut = hist.out.length > 1 ? expOut * .65 + v * .35 : v;
    if (kind === 'out') {
      samples++;
      if (samples >= 3) {
        opts.custom = { in: +expIn.toFixed(1), hi: .3, out: +Math.max(1.2, expOut - .3).toFixed(1), ho: .3 };
        save();
      }
      if (samples >= 5 && !advice) {
        const cv = arr => { const m = arr.reduce((s, x) => s + x, 0) / arr.length; return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length) / m; };
        if (cv(hist.in.slice(-5)) < .15 && cv(hist.out.slice(-5)) < .18) say('Ήρεμος, σταθερός ρυθμός.', 4);
      }
    }
  }
  function mineFrame(dt, now) {
    let l0, l1, q = null, label = '';
    if (phase === 'in') {
      const u = clamp((now - tIn0) / expIn, 0, 1);
      b = b0 + (1 - b0) * ease(u);
      l0 = SWEEP(u); l1 = SOLID(Math.min(1, f1Start + (now - tIn0) / .7));
      q = .5 * u; label = 'Εισπνοή';
      if (now - tIn0 > 9 && !advice) say('Μην κρατάτε την αναπνοή· αφήστε τη να κυλά φυσικά.', 5);
    } else if (phase === 'out') {
      const u = clamp((now - tOut0) / expOut, 0, 1);
      b = b1 * (1 - ease(u));
      l0 = SOLID(.6 * u); l1 = SWEEP(u);
      q = .5 + .5 * u; label = 'Εκπνοή';
      if (u >= 1) {
        if (pending) { pending = false; advance(); }
        if (!finished) { phase = 'rest'; tRest0 = now; renderControls(); }
      }
    } else if (phase === 'rest') {
      const tr = now - tRest0;
      b += (0 - b) * Math.min(1, dt * 2.5);
      l0 = SOLID(Math.min(1, .6 + .4 * tr / 1.5)); l1 = SOLID(clamp((tr - 1.2) / 1.5, 0, 1));
      label = tr > 4 ? 'Όταν είστε έτοιμοι' : '';
    } else {
      b += (.32 - b) * Math.min(1, dt * 2);
      l0 = SOLID(0); l1 = SOLID(0);
    }
    if (phase === 'in' || phase === 'out' || (phase === 'rest' && now - tRest0 < 8)) elapsed += dt;
    return { l0, l1, q, label };
  }

  // ── Τρόπος «Με τα χείλη» ────────────────────────────────────────────────
  function knot() {
    begin();
    if (textKind !== 'prayer') setText('prayer', true);
    const now = nowS();
    tTap = now; lastActivity = now;
    advance();
    renderControls();
  }
  function lipsFrame(dt, now) {
    const k = Math.exp(-(now - tTap) / .9);
    b += (.38 + .55 * k - b) * Math.min(1, dt * 8);
    if (count > 0 && !finished && now - lastActivity < 30) elapsed += dt;
    const g = reducedMotion ? 0 : Math.exp(-(now - tTap) / .7);
    return { l0: SOLID(0, g), l1: SOLID(0, g), q: null, label: '' };
  }

  // ── Κύριος βρόχος ───────────────────────────────────────────────────────
  let lastCounter = '', lastLabel = null, lastRhythm = '';
  function frame(ts) {
    const now = ts / 1000;
    const dt = lastFrame ? Math.min(.1, now - lastFrame) : 0;
    lastFrame = now;
    if (!COL) refreshColors();
    let r;
    if (finished) { b += (.4 - b) * Math.min(1, dt * 2); r = { l0: SOLID(0), l1: SOLID(0), q: null, label: 'Ο κανόνας ολοκληρώθηκε' }; }
    else if (opts.mode === 'guide') r = guideFrame(dt);
    else if (opts.mode === 'mine') r = mineFrame(dt, now);
    else r = lipsFrame(dt, now);
    if (textKind === 'opening' && !r.label) r.label = 'Προετοιμασία';

    const lim = timeLimit();
    if (lim && !finished && elapsed >= lim) finish();

    paintLine(sweeps[0], r.l0);
    paintLine(sweeps[1], r.l1);
    const fl = reducedMotion ? 1 : 1 + .03 * Math.sin(now * 9.1) + .02 * Math.sin(now * 15.7 + 1.3);
    stage.style.setProperty('--b', b.toFixed(3));
    stage.style.setProperty('--fl', fl.toFixed(3));
    const ring = $('kring');
    if (ring) {
      ring.style.opacity = r.q === null || r.q === undefined ? '0' : '1';
      if (r.q !== null && r.q !== undefined) ring.setAttribute('stroke-dashoffset', (ringC * (1 - r.q)).toFixed(2));
    }
    if (advice && now >= adviceUntil) advice = '';
    if (r.label !== lastLabel) { $('phase').textContent = r.label; lastLabel = r.label; }
    const c = counterHtml();
    if (c !== lastCounter) { $('counter').innerHTML = c; lastCounter = c; }
    const rh = advice || rhythmText();
    if (rh !== lastRhythm) { const el = $('rhythm'); el.textContent = rh; el.classList.toggle('advice', !!advice); lastRhythm = rh; }
    isonFrame(now);
    requestAnimationFrame(frame);
  }
  function say(text, secs) { advice = text; adviceUntil = nowS() + secs; }

  function fmtTime(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function counterHtml() {
    const t = target(), lim = timeLimit(), n = ropeSize();
    let s = `<b>${count}</b>${t ? ' / ' + t : ''} ${count === 1 ? 'ευχή' : 'ευχές'}`;
    if ((!t || t > n) && count) s += ` · κομποσκοίνι ${Math.floor((count - 1) / n) + 1}`;
    if (lim) s += ` · ${fmtTime(Math.max(0, lim - elapsed))} απομένουν`;
    else if (elapsed >= 1) s += ` · ${fmtTime(elapsed)}`;
    return s;
  }
  const num = x => x.toLocaleString('el', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  function rhythmText() {
    if (opts.mode === 'mine') return hist.in.length ? `Ο ρυθμός σας: εισπνοή ${num(expIn)}″ · εκπνοή ${num(expOut)}″` : '';
    if (opts.mode === 'guide') { const p = pace(); return `Ρυθμός: ${opts.pace === 'custom' ? 'ο δικός σας' : PACES[opts.pace].label.toLowerCase()} · εισπνοή ${num(p.in)}″ · εκπνοή ${num(p.out)}″`; }
    return '';
  }

  // ── Ήχος: ίσο, κόμπος, καμπανάκι (Web Audio, χωρίς αρχεία) ──────────────
  let actx = null, master = null, ison = null;
  function unlockAudio() {
    if (!(opts.ison || opts.tick || opts.bell)) return null;
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain();
        master.gain.value = opts.vol;
        master.connect(actx.destination);
      }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
    return actx;
  }
  function tone(freq, gain, dur, delay, type) {
    const c = actx; if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + .05);
  }
  // ξύλινο, απαλό «τοκ», σαν τον κόμπο ανάμεσα στα δάχτυλα
  function knock(bead) { if (!unlockAudio()) return; tone(bead ? 392 : 523, .09, .16); tone(bead ? 784 : 1046, .025, .07); }
  function bell() {
    if (!unlockAudio()) return;
    [[392, .22, 4.5], [784, .1, 3], [1083, .07, 2.4], [2117, .03, 1.4]].forEach(([f, g, d]) => tone(f, g, d));
    [[392, .16, 4], [784, .07, 2.6]].forEach(([f, g, d]) => tone(f, g, d, 2.2));
  }
  // Ίσο: σταθερός χαμηλός φθόγγος (Πα, περίπου Ρε) που «ανασαίνει» με την αναπνοή
  function startIson() {
    if (ison || !unlockAudio()) return;
    const c = actx, f0 = 146.83;
    const out = c.createGain(); out.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = .6;
    const vowel = c.createBiquadFilter(); vowel.type = 'peaking'; vowel.frequency.value = 420; vowel.Q.value = 1.3; vowel.gain.value = 7;
    const voices = [[f0, 'sawtooth', 0, .45], [f0, 'sawtooth', 7, .32], [f0 / 2, 'triangle', 0, .35], [f0 * 2, 'triangle', -5, .08]].map(([f, type, det, g]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const gg = c.createGain(); gg.gain.value = g;
      o.connect(gg).connect(lp); o.start();
      return o;
    });
    lp.connect(vowel).connect(out).connect(master);
    ison = { out, lp, voices };
  }
  function stopIson() {
    if (!ison || !actx) { ison = null; return; }
    const { out, voices } = ison, t = actx.currentTime;
    out.gain.cancelScheduledValues(t);
    out.gain.setTargetAtTime(0, t, .25);
    voices.forEach(o => o.stop(t + 1.5));
    ison = null;
  }
  let isonTestUntil = 0;
  function isonFrame(now) {
    if (now < isonTestUntil) return;          // δοκιμή ίσου από τις ρυθμίσεις
    const want = opts.ison && !finished && (
      (opts.mode === 'guide' && guideOn) ||
      (opts.mode === 'mine' && (phase === 'in' || phase === 'out' || (phase === 'rest' && now - tRest0 < 12))));
    if (want && !ison) startIson();
    if (!want && ison) stopIson();
    if (ison && actx) {
      const t = actx.currentTime;
      ison.out.gain.setTargetAtTime(.16 * (.3 + .7 * b), t, .1);
      ison.lp.frequency.setTargetAtTime(360 + 700 * b, t, .1);
    }
  }

  // ── Η οθόνη μένει αναμμένη όσο προσευχόμαστε ───────────────────────────
  async function requestWake() { try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; } }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) { /* ήδη ελεύθερο */ } wakeLock = null; }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // όταν κλείνει η οθόνη ή αλλάζει καρτέλα, σταματάμε ήρεμα
      if (guideOn) { guideOn = false; renderControls(); }
      if (holding || phase === 'in' || phase === 'out') { holding = false; pending = false; phase = count ? 'rest' : 'idle'; tRest0 = -99; renderControls(); }
      stopIson();
      wakeLock = null;
    } else {
      lastFrame = 0;
      if (active && !finished) requestWake();
    }
  });

  // ── Ήσυχη οθόνη ─────────────────────────────────────────────────────────
  let immFs = false;
  function setImmersive(on) {
    immersive = on;
    stage.classList.toggle('immersive', on);
    document.body.classList.toggle('no-scroll', on);
    if (on) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().then(() => { immFs = true; }).catch(() => {});
      $('imm-exit').focus({ preventScroll: true });
    } else {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      immFs = false;
    }
    COL = null;
    renderControls();
    requestAnimationFrame(reserveTextHeight);
  }
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && immFs && immersive) setImmersive(false); });

  // ── Χειρισμός ───────────────────────────────────────────────────────────
  function inPracticeView() {
    if (immersive) return true;
    const r = stage.getBoundingClientRect();
    return r.bottom > 80 && r.top < window.innerHeight - 80;
  }
  const holdBtn = $('hold-btn');
  holdBtn.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); try { holdBtn.setPointerCapture(e.pointerId); } catch (x) { /* */ } holdStart(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => holdBtn.addEventListener(ev, () => holdEnd()));
  holdBtn.addEventListener('keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) holdStart(); } });
  holdBtn.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); holdEnd(); } });
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());

  $('knot-btn').addEventListener('click', knot);
  $('start-btn').addEventListener('click', guideToggle);
  $('imm-pause').addEventListener('click', guideToggle);
  $('reset-btn').addEventListener('click', () => { reset(); announce('Από την αρχή.'); });
  $('imm-btn').addEventListener('click', () => setImmersive(true));
  $('imm-exit').addEventListener('click', () => setImmersive(false));

  // Στο κομποσκοίνι αρκεί ένα πάτημα πάνω του· στην ήσυχη οθόνη, οπουδήποτε.
  // (εκτός ήσυχης οθόνης ακούμε το click, ώστε το κύλισμα της σελίδας με το δάχτυλο να μη μετρά κόμπο)
  stage.addEventListener('pointerdown', e => {
    if (!immersive || e.target.closest('button, a, input, select, label')) return;
    if (opts.mode === 'lips') { e.preventDefault(); knot(); }
    else if (opts.mode === 'mine') { e.preventDefault(); try { stage.setPointerCapture(e.pointerId); } catch (x) { /* */ } holdStart(); }
  });
  stage.addEventListener('click', e => {
    if (immersive || opts.mode !== 'lips' || !e.target.closest('#rope')) return;
    knot();
  });
  ['pointerup', 'pointercancel'].forEach(ev => stage.addEventListener(ev, () => { if (opts.mode === 'mine' && immersive) holdEnd(); }));
  stage.addEventListener('contextmenu', e => { if (immersive) e.preventDefault(); });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && immersive) { setImmersive(false); return; }
    if (e.code !== 'Space') return;
    if (e.target.closest && e.target.closest('input, select, textarea, summary, a, button, details')) return;
    if (!inPracticeView()) return;
    e.preventDefault();
    if (e.repeat) return;
    if (opts.mode === 'lips') knot();
    else if (opts.mode === 'mine') holdStart();
    else guideToggle();
  });
  document.addEventListener('keyup', e => {
    if (e.code === 'Space' && opts.mode === 'mine' && holding && e.target !== holdBtn) { e.preventDefault(); holdEnd(); }
  });

  function setMode(m) {
    if (m === opts.mode) return;
    if (guideOn) { guideOn = false; }
    if (holding) holding = false;
    pending = false; phase = count ? 'rest' : 'idle'; tRest0 = -99;
    stopIson();
    opts.mode = m; save();
    if (!finished) setText(textKind === 'prayer' || count ? 'prayer' : initialText(), true);
    renderControls(); renderSettings();
  }
  document.querySelectorAll('.modes button').forEach(btn => btn.addEventListener('click', () => setMode(btn.dataset.mode)));

  // ── Διεπαφή ─────────────────────────────────────────────────────────────
  function renderControls() {
    practice.dataset.mode = opts.mode;
    stage.dataset.mode = opts.mode;
    document.querySelectorAll('.modes button').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mode === opts.mode)));
    $('mode-hint').textContent = (textKind === 'opening' && opts.mode !== 'guide' ? 'Πείτε πρώτα το «Δι᾿ εὐχῶν τῶν ἁγίων Πατέρων ἡμῶν…». ' : '') + MODE_HINTS[opts.mode];
    const st = $('start-btn');
    st.textContent = guideOn ? 'Παύση' : (count && !finished) || prepLeft ? 'Συνέχεια' : 'Έναρξη';
    $('imm-pause').textContent = guideOn ? 'Παύση' : 'Συνέχεια';
    holdBtn.classList.toggle('down', holding);
    holdBtn.textContent = holding ? 'Εισπνοή…' : phase === 'out' ? 'Εκπνοή…' : finished ? 'Νέα αρχή · εισπνοή' : 'Κρατήστε πατημένο · εισπνοή';
    $('eyes-wrap').hidden = opts.mode === 'lips';
    $('eyes-cb').checked = !!opts.eyes;
    ptext.classList.toggle('eyes', opts.eyes && opts.mode !== 'lips' && textKind === 'prayer');
    const hints = { lips: 'Πατήστε οπουδήποτε σε κάθε ευχή', mine: 'Κρατήστε πατημένη την οθόνη όσο εισπνέετε', guide: '' };
    $('imm-hint').textContent = hints[opts.mode];
  }

  function renderSettings() {
    const fs = $('form-sel');
    if (!fs.options.length) fs.innerHTML = Object.entries(FORMS).map(([k, f]) => `<option value="${k}">${f.label}</option>`).join('');
    fs.value = opts.form;
    $('other-wrap').hidden = opts.form !== 'other';
    document.querySelectorAll('[data-g]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.g === opts.gender)));
    if (document.activeElement !== $('other-name')) $('other-name').value = opts.name || '';
    document.querySelectorAll('[data-pace]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.pace === opts.pace)));
    const customBtn = document.querySelector('[data-pace="custom"]');
    customBtn.disabled = !opts.custom;
    customBtn.title = opts.custom ? 'Ο ρυθμός που έμαθε η σελίδα από την αναπνοή σας' : 'Κάντε πρώτα μερικές αναπνοές «Με την αναπνοή μου»';
    const p = pace(), per = p.in + p.hi + p.out + p.ho;
    $('pace-hint').textContent = `Εισπνοή ${num(p.in)}″ · εκπνοή ${num(p.out)}″ · περίπου ${Math.round(100 * per / 60)} λεπτά για 100 ευχές.` +
      (opts.custom ? '' : ' Ο «δικός μου» ρυθμός μαθαίνεται από τον τρόπο «Με την αναπνοή μου».');
    $('prep-cb').checked = !!opts.prep;
    $('mono-cb').checked = !!opts.mono;
    $('rule-sel').value = opts.rule;
    $('ison-cb').checked = !!opts.ison;
    $('tick-cb').checked = !!opts.tick;
    $('bell-cb').checked = !!opts.bell;
    $('vol').value = String(opts.vol);
    $('vib-knot-cb').checked = !!opts.vibKnot;
    $('vib-phase-cb').checked = !!opts.vibPhase;
    const canVibrate = 'vibrate' in navigator;
    $('vib-note').hidden = canVibrate;
  }

  function setOpt(k, v) {
    opts[k] = v; save();
    if (k === 'rule') { reset(); renderSettings(); return; }
    if (k === 'vol' && master && actx) master.gain.setTargetAtTime(v, actx.currentTime, .05);
    if (k === 'ison' || k === 'tick' || k === 'bell') { if (v) unlockAudio(); if (k === 'ison' && !v) stopIson(); }
    if (['form', 'mono', 'gender', 'name'].includes(k) && textKind) { setText(textKind, true); reserveTextHeight(); }
    if (k === 'prep' && count === 0 && !finished && !guideOn && phase === 'idle') setText(initialText(), true);
    renderSettings(); renderControls();
  }
  $('form-sel').addEventListener('change', e => setOpt('form', e.target.value));
  $('other-name').addEventListener('input', e => setOpt('name', e.target.value));
  document.querySelectorAll('[data-g]').forEach(x => x.addEventListener('click', () => setOpt('gender', x.dataset.g)));
  document.querySelectorAll('[data-pace]').forEach(x => x.addEventListener('click', () => { setOpt('pace', x.dataset.pace); if (guideOn) cycleT = 0; }));
  $('prep-cb').addEventListener('change', e => setOpt('prep', e.target.checked));
  $('mono-cb').addEventListener('change', e => setOpt('mono', e.target.checked));
  $('rule-sel').addEventListener('change', e => setOpt('rule', e.target.value));
  $('ison-cb').addEventListener('change', e => setOpt('ison', e.target.checked));
  $('tick-cb').addEventListener('change', e => setOpt('tick', e.target.checked));
  $('bell-cb').addEventListener('change', e => setOpt('bell', e.target.checked));
  $('vol').addEventListener('input', e => setOpt('vol', Number(e.target.value)));
  $('vib-knot-cb').addEventListener('change', e => setOpt('vibKnot', e.target.checked));
  $('vib-phase-cb').addEventListener('change', e => setOpt('vibPhase', e.target.checked));
  $('eyes-cb').addEventListener('change', e => {
    opts.eyes = e.target.checked;
    if (opts.eyes && !opts.ison) { opts.ison = true; unlockAudio(); }
    save(); renderSettings(); renderControls();
  });
  $('ison-test').addEventListener('click', () => {
    if (!unlockAudio()) { opts.ison = true; save(); renderSettings(); unlockAudio(); }
    startIson();
    if (ison && actx) {
      // μια αργή «εισπνοή» και «εκπνοή» για να ακουστεί πώς οδηγεί το ίσο
      const t = actx.currentTime;
      isonTestUntil = nowS() + 4.6;
      ison.out.gain.cancelScheduledValues(t);
      ison.lp.frequency.cancelScheduledValues(t);
      ison.out.gain.setValueAtTime(.05, t);
      ison.lp.frequency.setValueAtTime(380, t);
      ison.out.gain.linearRampToValueAtTime(.16, t + 2);
      ison.lp.frequency.linearRampToValueAtTime(1050, t + 2);
      ison.out.gain.linearRampToValueAtTime(.05, t + 4.5);
      ison.lp.frequency.linearRampToValueAtTime(380, t + 4.5);
    }
  });

  // Αλλαγή θέματος: ξαναδιαβάζουμε τα χρώματα
  new MutationObserver(() => { COL = null; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { COL = null; });

  // ── Μέτρημα ημέρας (μόνο στη συσκευή) ───────────────────────────────────
  function todayKey() { const d = new Date(); return 'prayers-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function readToday() { try { return Number(localStorage.getItem(todayKey())) || 0; } catch (e) { return 0; } }
  function bumpToday() { try { localStorage.setItem(todayKey(), String(readToday() + 1)); } catch (e) { /* χωρίς αποθήκευση */ } renderToday(); }
  function renderToday() {
    const n = readToday();
    $('today').textContent = n ? `Σήμερα σε αυτή τη συσκευή: ${n} ${n === 1 ? 'ευχή' : 'ευχές'}. Δόξα τῷ Θεῷ.` : '';
  }
  function announce(text) { $('sr-status').textContent = text; }

  // ── Λέξη προς λέξη ──────────────────────────────────────────────────────
  const WORDS = [
    { w: 'Κύριε', d: 'Ομολογούμε ότι ο Ιησούς είναι ο Κύριος, ο αληθινός Θεός. Αυτή η ομολογία δεν είναι δικό μας κατόρθωμα· είναι δώρο του Αγίου Πνεύματος.',
      ref: 'οὐδεὶς δύναται εἰπεῖν Κύριον Ἰησοῦν εἰ μὴ ἐν Πνεύματι Ἁγίῳ.', src: 'Α΄ Κορ. 12:3' },
    { w: 'Ἰησοῦ', d: 'Το όνομα του Σωτήρα, που σημαίνει «ο Θεός σώζει». Η ευχή είναι πρώτα απ’ όλα επίκληση αυτού του ονόματος· γι’ αυτό λέγεται «ευχή του Ιησού».',
      ref: 'καλέσεις τὸ ὄνομα αὐτοῦ Ἰησοῦν· αὐτὸς γὰρ σώσει τὸν λαὸν αὐτοῦ ἀπὸ τῶν ἁμαρτιῶν αὐτῶν.', src: 'Ματθ. 1:21' },
    { w: 'Χριστέ', d: '«Χριστός» σημαίνει «ο Χρισμένος», ο Μεσσίας που περίμεναν οι προφήτες. Ομολογούμε ότι σε Αυτόν εκπληρώθηκαν όλες οι υποσχέσεις του Θεού.',
      ref: 'εὑρήκαμεν τὸν Μεσσίαν, ὅ ἐστι μεθερμηνευόμενον Χριστός.', src: 'Ιω. 1:41' },
    { w: 'Υἱὲ τοῦ Θεοῦ', d: 'Η ομολογία του Αποστόλου Πέτρου. Ο Ιησούς δεν είναι απλώς διδάσκαλος· είναι ο Υιός του Πατρός, ένας από την Αγία Τριάδα.',
      ref: 'Σὺ εἶ ὁ Χριστὸς ὁ Υἱὸς τοῦ Θεοῦ τοῦ ζῶντος.', src: 'Ματθ. 16:16' },
    { w: 'ἐλέησόν με', d: 'Η κραυγή των τυφλών και των αρρώστων του Ευαγγελίου. Το έλεος του Θεού είναι η αγάπη Του που θεραπεύει, συγχωρεί και ανορθώνει. Λέμε «με», προσωπικά: στέκομαι εγώ ο ίδιος μπροστά Του.',
      ref: 'Ἰησοῦ, υἱὲ Δαυΐδ, ἐλέησόν με.', src: 'Λουκ. 18:38' },
    { w: 'τὸν ἁμαρτωλόν', d: 'Τα λόγια του Τελώνη, που «κατέβη δεδικαιωμένος». Δεν είναι απελπισία αλλά ταπείνωση: όποιος γνωρίζει την αμαρτία του, ανοίγεται στο έλεος.',
      ref: 'ὁ Θεός, ἱλάσθητί μοι τῷ ἁμαρτωλῷ.', src: 'Λουκ. 18:13' },
  ];
  function renderWords(sel) {
    $('words').innerHTML = WORDS.map((x, i) =>
      `<button type="button" class="word" aria-pressed="${i === sel}" data-i="${i}">${x.w}</button>`).join('');
    const x = WORDS[sel];
    $('word-card').innerHTML = `<h3>${x.w}</h3><p style="margin:0;line-height:1.7">${x.d}</p><p class="ref">${x.ref}<cite>${x.src}</cite></p>`;
  }
  $('words').addEventListener('click', e => { const btn = e.target.closest('.word'); if (btn) renderWords(Number(btn.dataset.i)); });

  // ── Εκκίνηση ────────────────────────────────────────────────────────────
  renderSettings();
  buildRope();
  setText(initialText(), true);
  reserveTextHeight();
  practice.dataset.ready = '1';
  renderControls();
  renderToday();
  renderWords(0);
  requestAnimationFrame(frame);

  // για αυτόματους ελέγχους
  window.__prayer = { state: () => ({ count, elapsed, phase, b, guideOn, finished, expIn, expOut, textKind, holding }) };
})();

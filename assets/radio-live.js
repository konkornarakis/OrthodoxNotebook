// assets/radio-live.js — ζωντανή ακρόαση της Πειραϊκής Εκκλησίας 91.2 με επιστροφή πίσω
//
// Η σελίδα διαβάζει η ίδια τη ροή του σταθμού με fetch() (επιτρέπεται επειδή ο σταθμός στέλνει
// Access-Control-Allow-Origin: *), την κόβει σε κομμάτια ~5″ στα όρια των πλαισίων MP3 και τα
// φυλάει στο IndexedDB της συσκευής, το καθένα με την ώρα που μεταδόθηκε. Η αναπαραγωγή γίνεται
// πάντα από τα φυλαγμένα κομμάτια (MediaSource), άρα «ζωντανά» = λίγα δευτερόλεπτα πίσω από το άκρο,
// και η ροή κατεβαίνει μία φορά. Όπου δεν υπάρχει MediaSource για MP3 (παλιά iPhone), το ζωντανό
// παίζει απευθείας από τον σταθμό και το «πίσω» από ενωμένα κομμάτια (Blob).
(function () {
  'use strict';
  const STREAM = window.RADIO_LIVE_SRC || 'https://impradio.bytemasters.gr/8002/stream';
  const CHUNK_S = 5;            // διάρκεια κομματιού
  const AHEAD = 60;             // δευτερόλεπτα που φορτώνονται μπροστά από τη θέση αναπαραγωγής
  const BEHIND = 90;            // ... και κρατιούνται πίσω της (στη μνήμη του player, όχι στη συσκευή)
  const LIVE_LAG = 8;           // «Ζωντανά» = τόσα δευτερόλεπτα πίσω από το τελευταίο κομμάτι
  const LIVE_NEAR = 25;         // μέχρι εδώ πίσω θεωρείται ότι ακούς ζωντανά
  const KEEP_OPTS = [1, 3, 6, 12, 24, 48, Infinity];
  const MB_PER_H = 86;          // 192 kbps
  const BPS = 192000 / 8;       // bytes/δευτ. της ροής (για την εκτίμηση της απευθείας ακρόασης)

  const $ = id => document.getElementById(id);
  const TR = window.RADIO_LIVE_TRACE ? [] : null;
  const trace = (...a) => { if (TR) TR.push([Math.round(performance.now()), ...a]); };
  const root = $('live');
  if (!root) return;
  const store = {
    get(k) { try { return localStorage.getItem('radio:live-' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('radio:live-' + k, v); } catch (e) { /* */ } },
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  function fmt(t) {
    t = Math.max(0, Math.floor(t || 0));
    const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }
  function fmtDur(t) {
    const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60);
    return h ? h + ' ώρ.' + (m ? ' ' + m + '′' : '') : m ? m + '′' : Math.floor(t) + '″';
  }
  const clockFmt = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const hmFmt = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayShort = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', weekday: 'short' });
  const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function athensToEpoch(y, mo, d, h, mi, s) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s);
    const p = partsFmt.formatToParts(new Date(guess)).reduce((o, x) => (o[x.type] = +x.value, o), {});
    return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess);
  }
  // ώρα με ημέρα, όταν δεν είναι σήμερα (π.χ. «Σάβ 23:10»)
  const clockLabel = (ms, f) => (dateFmt.format(ms) === dateFmt.format(Date.now()) ? '' : dayShort.format(ms) + ' ') + (f || hmFmt).format(ms);

  // ── IndexedDB ───────────────────────────────────────────────────
  // idx: { id, pos, dur, size, t0, gap }   data: id → ArrayBuffer (τα bytes του κομματιού)
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('radio-live', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('idx', { keyPath: 'id' }); r.result.createObjectStore('data'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    }));
  }
  function tx(stores, mode, fn) {
    return db().then(d => new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => res(typeof out === 'function' ? out() : out);
      t.onerror = e => { e.preventDefault(); rej(t.error); };
      t.onabort = () => rej(t.error || new DOMException('Ακύρωση', 'AbortError'));
    }));
  }
  const getData = id => (mem.has(id) ? Promise.resolve(mem.get(id)) : tx(['data'], 'readonly', t => { const r = t.objectStore('data').get(id); return () => r.result || null; }).catch(() => null));
  const getRange = (a, b) => tx(['data'], 'readonly', t => { const r = t.objectStore('data').getAll(IDBKeyRange.bound(a, b)); return () => r.result || []; });

  let C = [];                     // τα κομμάτια (μεταδεδομένα), με αύξουσα σειρά
  const mem = new Map();          // τα πιο πρόσφατα κομμάτια και στη μνήμη, για γρήγορη τροφοδοσία στο ζωντανό
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('radio-live') : null;
  let keepH = Number(store.get('keep')) || 12;
  if (store.get('keep') === 'inf') keepH = Infinity;
  if (!KEEP_OPTS.includes(keepH)) keepH = 12;

  const first = () => (C.length ? C[0].pos : 0);
  const edge = () => (C.length ? C[C.length - 1].pos + C[C.length - 1].dur : 0);
  const stored = () => C.reduce((a, c) => a + c.dur, 0);
  const bytes = () => C.reduce((a, c) => a + c.size, 0);
  // το τελευταίο κομμάτι που αρχίζει πριν ή στη θέση p
  function idxAt(p) {
    let lo = 0, hi = C.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (C[m].pos <= p) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function idxOfId(id) {
    let lo = 0, hi = C.length - 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (C[m].id < id) lo = m + 1; else hi = m - 1; }
    return lo;    // το πρώτο με id ≥ id
  }
  function clockAt(p) {
    const i = idxAt(p);
    if (i < 0) return C.length ? C[0].t0 : null;
    const c = C[i];
    return c.t0 + Math.min(Math.max(0, p - c.pos), c.dur) * 1000;
  }
  // θέση για μια ώρα μετάδοσης· σε κενό, η αρχή του επόμενου κομματιού· null αν είναι εκτός
  function posAtClock(ms) {
    if (!C.length || ms < C[0].t0 - 1000) return null;
    let lo = 0, hi = C.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (C[m].t0 + C[m].dur * 1000 > ms) { ans = m; hi = m - 1; } else lo = m + 1; }
    if (ans < 0) return null;
    const c = C[ans];
    return ms <= c.t0 ? c.pos : c.pos + (ms - c.t0) / 1000;
  }

  async function evictFirst(n) {
    n = Math.min(n, C.length);
    if (n <= 0) return;
    const upto = C[n - 1].id;
    await tx(['idx', 'data'], 'readwrite', t => {
      const k = IDBKeyRange.upperBound(upto);
      t.objectStore('idx').delete(k); t.objectStore('data').delete(k);
    });
    dropUpto(upto);
    if (bc) bc.postMessage({ type: 'evict', upto });
  }
  function dropUpto(upto) {
    const n = idxOfId(upto + 1);
    for (const c of C.slice(0, n)) mem.delete(c.id);
    C.splice(0, n);
    dirty = true;
  }
  async function evictByKeep() {
    if (!Number.isFinite(keepH) || !C.length) return;
    const limit = edge() - keepH * 3600;
    let n = 0;
    while (n < C.length && C[n].pos + C[n].dur <= limit) n++;
    if (n) await evictFirst(n);
  }

  // ── Χωρισμός της ροής σε πλαίσια MP3 ────────────────────────────
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const BRL2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384];
  const SRS = [44100, 48000, 32000];
  function header(b, i) {
    if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return null;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
    const bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, padb = (b[i + 2] >> 1) & 1;
    if (ver === 1 || bri === 0 || bri === 15 || sri === 3 || (layer !== 1 && layer !== 2)) return null;
    const v1 = ver === 3, sr = SRS[sri] / (v1 ? 1 : ver === 2 ? 2 : 4);
    let br, spf, len;
    if (layer === 1) { br = (v1 ? BR1 : BR2)[bri]; spf = v1 ? 1152 : 576; len = Math.floor((v1 ? 144 : 72) * br * 1000 / sr) + padb; }
    else { br = (v1 ? BRL2 : BR2)[bri]; spf = 1152; len = Math.floor(144 * br * 1000 / sr) + padb; }
    return { len, spf, sr };
  }
  // Τα πλαίσια MP3 δανείζονται δεδομένα από τα προηγούμενα (bit reservoir). Όπου η ροή αρχίζει από τη μέση
  // (νέα σύνδεση, άλμα), τα πρώτα πλαίσια γίνονται σιωπηλά (καμία αναφορά προς τα πίσω, μηδενική ένταση),
  // ώστε ο αποκωδικοποιητής να μη σταματά με σφάλμα· τα δεδομένα τους μένουν, για να στηρίξουν τα επόμενα.
  function setBits(b, at, n, v) {
    for (let k = n - 1; k >= 0; k--, at++) {
      const bit = (v >> k) & 1, i = at >> 3, m = 0x80 >> (at & 7);
      b[i] = bit ? b[i] | m : b[i] & ~m;
    }
  }
  function prime(src) {
    const b = new Uint8Array(src.byteLength);
    b.set(new Uint8Array(src));
    let i = 0, data = 0;
    for (let f = 0; f < 6 && data < 511 && i + 4 <= b.length; f++) {
      const h = header(b, i);
      if (!h || i + h.len > b.length) break;
      const mpeg1l3 = ((b[i + 1] >> 3) & 3) === 3 && ((b[i + 1] >> 1) & 3) === 1;
      if (!mpeg1l3) break;
      const mono = (b[i + 3] >> 6) === 3, nch = mono ? 1 : 2, crc = (b[i + 1] & 1) === 0;
      const side = (i + 4 + (crc ? 2 : 0)) * 8;
      setBits(b, side, 9, 0);                                   // main_data_begin
      let at = side + 9 + (mono ? 5 : 3);
      for (let c = 0; c < nch; c++, at += 4) setBits(b, at, 4, 0);   // scfsi
      for (let g = 0; g < 2; g++) for (let c = 0; c < nch; c++, at += 59) {
        setBits(b, at, 12, 0); setBits(b, at + 12, 9, 0); setBits(b, at + 21, 8, 0); setBits(b, at + 29, 4, 0);   // part2_3_length, big_values, global_gain, scalefac_compress
      }
      data += h.len - 4 - (crc ? 2 : 0) - (mono ? 17 : 32);
      i += h.len;
    }
    return b.buffer;
  }
  function Splitter() {
    let buf = new Uint8Array(0), parts = [], partBytes = 0, samples = 0, sr = 0, synced = false;
    function flush() {
      const o = new Uint8Array(partBytes);
      let p = 0;
      for (const x of parts) { o.set(x, p); p += x.length; }
      const c = { buf: o.buffer, dur: samples / sr, size: partBytes };
      parts = []; partBytes = 0; samples = 0;
      return c;
    }
    this.push = data => {
      if (buf.length) { const b = new Uint8Array(buf.length + data.length); b.set(buf); b.set(data, buf.length); buf = b; } else buf = data;
      const out = [];
      let i = 0;
      while (i + 4 <= buf.length) {
        const h = header(buf, i);
        if (!h) { i++; synced = false; continue; }
        if (i + h.len > buf.length) break;
        if (!synced) {
          // μετά από χάσιμο συγχρονισμού: δεκτό μόνο αν ακολουθεί αμέσως κι άλλο πλαίσιο
          if (i + h.len + 4 > buf.length) break;
          const n = header(buf, i + h.len);
          if (!n || n.sr !== h.sr) { i++; continue; }
          synced = true;
        }
        if (samples && h.sr !== sr) out.push(flush());
        sr = h.sr;
        parts.push(buf.slice(i, i + h.len)); partBytes += h.len; samples += h.spf;
        i += h.len;
        if (samples >= CHUNK_S * sr) out.push(flush());
      }
      buf = buf.slice(i);
      return out;
    };
  }

  // ── Κατανάλωση δεδομένων ────────────────────────────────────────
  // Μετριούνται τα bytes που κατεβαίνουν για αποθήκευση (ακριβώς) και, στην εφεδρεία, όσα κατεβάζει
  // ο player απευθείας από τον σταθμό (εκτίμηση από τον χρόνο ακρόασης × 192 kbps).
  const usage = { sess: 0, direct: 0, day: '', dayB: 0, month: '', monthB: 0, dirty: false };
  try { Object.assign(usage, JSON.parse(store.get('usage') || '{}'), { sess: 0, direct: 0 }); } catch (e) { /* */ }
  function addUsage(n, direct) {
    const d = dateFmt.format(Date.now()), m = d.slice(0, 7);
    if (usage.day !== d) { usage.day = d; usage.dayB = 0; }
    if (usage.month !== m) { usage.month = m; usage.monthB = 0; }
    usage.dayB += n; usage.monthB += n;
    if (direct) usage.direct += n; else usage.sess += n;
    usage.dirty = true;
  }
  function saveUsage() {
    if (!usage.dirty) return;
    usage.dirty = false;
    store.set('usage', JSON.stringify({ day: usage.day, dayB: usage.dayB, month: usage.month, monthB: usage.monthB }));
  }
  setInterval(saveUsage, 10000);
  window.addEventListener('pagehide', saveUsage);
  const mb = b => (b >= 1e9 ? (b / 1073741824).toFixed(2).replace('.', ',') + ' GB' : b < 10485760 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(b / 1048576) + ' MB');
  const gbh = h => (h * MB_PER_H >= 1000 ? (h * MB_PER_H / 1000).toFixed(1).replace('.', ',') + ' GB' : h * MB_PER_H + ' MB');

  // ── Αποθήκευση της ροής ─────────────────────────────────────────
  const Rec = { on: false, state: 'off', ctrl: null, release: null, remoteAt: 0, err: '' };
  const remoteRec = () => Date.now() - Rec.remoteAt < 12000;
  function getLock() {
    if (!navigator.locks) return Promise.resolve(true);
    return new Promise(res => {
      navigator.locks.request('radio-live-rec', { ifAvailable: true }, lock => {
        if (!lock) { res(false); return undefined; }
        res(true);
        return new Promise(r => { Rec.release = r; });
      }).catch(() => res(true));
    });
  }
  async function recStart() {
    if (Rec.on) return true;
    if (!(await getLock())) { Rec.state = 'remote'; render(); return false; }
    Rec.on = true; Rec.err = ''; Rec.state = 'connecting';
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* */ }
    recLoop();
    render();
    return true;
  }
  function recStop(reason) {
    Rec.on = false; Rec.state = 'off';
    if (reason) Rec.err = reason;
    if (Rec.ctrl) Rec.ctrl.abort();
    if (Rec.release) { Rec.release(); Rec.release = null; }
    if (bc) bc.postMessage({ type: 'rec', on: false });
    // εφεδρεία: το απευθείας ζωντανό δεν φυλάγεται, άρα συνεχίζουμε από τα αποθηκευμένα ως το τέλος τους
    if (F && F.mode === 'stream') { cur = pos(); if (want) fbStart(cur, false); else F = null; }
    render();
  }
  async function recLoop() {
    let backoff = 1;
    while (Rec.on) {
      const sess = { S: Infinity, dur: 0, fresh: true, at: Date.now() };
      try { await recOnce(sess); } catch (e) {
        if (e && e.quota) { recStop('Γέμισε ο χώρος της συσκευής· η αποθήκευση σταμάτησε.'); break; }
      }
      if (!Rec.on) break;
      if (sess.dur > 30) backoff = 1;
      Rec.state = navigator.onLine === false ? 'offline' : 'retry';
      render();
      await sleep(backoff * 1000);
      backoff = Math.min(30, backoff * 2);
    }
  }
  async function recOnce(sess) {
    const ctrl = new AbortController();
    Rec.ctrl = ctrl;
    let last = Date.now();
    const dog = setInterval(() => { if (Date.now() - last > 15000) ctrl.abort(); }, 3000);
    try {
      const r = await fetch(STREAM, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit' });
      if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
      const reader = r.body.getReader(), sp = new Splitter();
      for (;;) {
        const { value, done } = await reader.read();
        if (done || !Rec.on) break;
        last = Date.now();
        addUsage(value.byteLength, false);
        for (const c of sp.push(value)) await addChunk(sess, c);
      }
    } finally { clearInterval(dog); if (Rec.ctrl === ctrl) Rec.ctrl = null; }
  }
  async function addChunk(sess, c) {
    if (!Rec.on) return;
    const now = Date.now();
    sess.dur += c.dur;
    // Η αρχή της σύνδεσης σε ώρα μετάδοσης: κανένα byte δεν φτάνει πριν μεταδοθεί, και ο σταθμός στέλνει
    // στην αρχή μερικά δευτερόλεπτα από πριν· άρα το μικρότερο (τώρα − διάρκεια ως εδώ).
    sess.S = Math.min(sess.S, now - sess.dur * 1000);
    const prev = C[C.length - 1];
    const t0 = Math.round(sess.S + (sess.dur - c.dur) * 1000);
    const prevEnd = prev ? prev.t0 + prev.dur * 1000 : -Infinity;
    // σε επανασύνδεση ο σταθμός ξαναστέλνει όσα ήδη έχουμε: παραλείπονται
    if (sess.fresh && prev && t0 + c.dur * 1000 <= prevEnd + 500) return;
    const meta = { id: prev ? prev.id + 1 : 1, pos: prev ? prev.pos + prev.dur : 0, dur: c.dur, size: c.size, t0, gap: !!(sess.fresh && prev && t0 - prevEnd > 2500) };
    if (sess.fresh) c.buf = prime(c.buf);      // αρχή σύνδεσης: η ροή αρχίζει από τη μέση
    sess.fresh = false;
    for (let tries = 0; ; tries++) {
      try {
        await tx(['idx', 'data'], 'readwrite', t => { t.objectStore('data').put(c.buf, meta.id); t.objectStore('idx').put(meta); });
        break;
      } catch (e) {
        if (!e || e.name !== 'QuotaExceededError' || tries >= 4 || stored() < 600) { const q = new Error('quota'); q.quota = e && e.name === 'QuotaExceededError'; throw q; }
        await evictFirst(Math.max(20, Math.round(C.length * 0.05)));    // δεν χωράει: φεύγουν τα παλαιότερα
      }
    }
    C.push(meta);
    mem.set(meta.id, c.buf);
    if (mem.size > 40) mem.delete(mem.keys().next().value);
    Rec.state = 'on'; dirty = true;
    if (bc) bc.postMessage({ type: 'chunk', meta });
    await evictByKeep();
    onChunk();
  }

  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    if (m.type === 'chunk') { if (!C.length || m.meta.id > C[C.length - 1].id) { C.push(m.meta); dirty = true; onChunk(); } }
    else if (m.type === 'evict') dropUpto(m.upto);
    else if (m.type === 'clear') { C = []; mem.clear(); reset(); }
    else if (m.type === 'rec') { Rec.remoteAt = m.on ? Date.now() : 0; if (!Rec.on) Rec.state = m.on ? 'remote' : 'off'; render(); }
  };
  setInterval(() => { if (bc && Rec.on) bc.postMessage({ type: 'rec', on: true }); }, 5000);

  // ── Αναπαραγωγή ─────────────────────────────────────────────────
  const audio = new Audio();
  audio.preload = 'auto';
  const MSE = window.ManagedMediaSource || window.MediaSource;
  const useMSE = !window.RADIO_LIVE_NOMSE && !!(MSE && MSE.isTypeSupported && MSE.isTypeSupported('audio/mpeg'));
  const RATES = [1, 1.25, 1.5, 2, 0.75];
  let want = false;                 // πρόθεση του χρήστη να ακούει
  let cur = Number(store.get('pos'));   // η θέση όταν δεν παίζει
  let rate = 1;
  let E = null;                     // MediaSource: { ms, sb, nextId, gen, seekTo, busy, flush }
  let F = null;                     // εφεδρεία: { mode: 'blob'|'stream', base, end, url }
  let dirty = true, lastSave = 0;

  function pos() {
    if (E && E.seekTo == null && E.started) return audio.currentTime;
    if (F && F.mode === 'stream') return Math.max(F.base, edge() - LIVE_LAG);
    if (F && F.ready) return F.base + audio.currentTime;
    return cur;
  }
  const clamp = p => Math.min(Math.max(p, first()), Math.max(first(), edge() - 0.5));

  // MediaSource
  function mseAttach(p) {
    const ms = new MSE(), gen = (E ? E.gen : 0) + 1;
    E = { ms, sb: null, nextId: null, gen, seekTo: p, busy: false, flush: false, started: false, fails: 0 };
    const isManaged = window.ManagedMediaSource && ms instanceof window.ManagedMediaSource;
    if (isManaged) audio.disableRemotePlayback = true;
    ms.addEventListener('sourceopen', () => {
      if (!E || E.ms !== ms) return;
      try {
        E.sb = ms.addSourceBuffer('audio/mpeg');
        try { E.sb.mode = 'sequence'; } catch (e) { /* ήδη sequence */ }
        E.sb.addEventListener('updateend', () => { afterAppend(); pump(); });
      } catch (e) { msg('Η συσκευή δεν μπορεί να παίξει τα αποθηκευμένα.'); return; }
      pump();
    }, { once: true });
    if (isManaged && 'srcObject' in audio) { try { audio.srcObject = ms; } catch (e) { audio.src = URL.createObjectURL(ms); } }
    else audio.src = URL.createObjectURL(ms);
  }
  function inBuf(p) {
    if (!E || !E.sb) return false;
    const b = E.sb.buffered;
    for (let i = 0; i < b.length; i++) if (p >= b.start(i) - 0.05 && p < b.end(i) - 0.3) return true;
    return false;
  }
  function bufEnd(p) {
    const b = E.sb.buffered;
    for (let i = 0; i < b.length; i++) if (p >= b.start(i) - 0.3 && p <= b.end(i) + 0.3) return b.end(i);
    return p;
  }
  function afterAppend() {
    if (!E || E.seekTo == null || !inBuf(E.seekTo)) return;
    audio.currentTime = E.seekTo;
    E.seekTo = null; E.started = true;
    audio.playbackRate = rate;
    if (want) audio.play().catch(playFailed);
    render();
  }
  function pump() {
    if (!E || !E.sb || E.busy || E.sb.updating || E.ms.readyState !== 'open') return;
    const sb = E.sb, t = audio.currentTime;
    if (E.flush) {
      E.flush = false;
      if (sb.buffered.length) { trace('flush', t); sb.remove(0, sb.buffered.end(sb.buffered.length - 1) + 1); return; }
    }
    if (E.seekTo == null && sb.buffered.length && sb.buffered.start(0) < t - BEHIND - 30) { trace('trim', t); sb.remove(0, Math.max(0, t - BEHIND)); return; }
    const at = E.seekTo != null ? E.seekTo : t;
    if (E.seekTo == null && bufEnd(at) - at > AHEAD) return;
    if (E.ms.streaming === false && E.seekTo == null && bufEnd(at) - at > 15) return;   // ManagedMediaSource: εξοικονόμηση
    let i = E.nextId == null ? idxAt(at) : idxOfId(E.nextId);
    if (i < 0) i = 0;
    if (i >= C.length) return;      // περιμένουμε το επόμενο κομμάτι
    const c = C[i], gen = E.gen;
    E.busy = true;
    getData(c.id).then(buf => {
      if (!E || gen !== E.gen) return;
      E.busy = false;
      if (!buf) { E.nextId = c.id + 1; E.jump = true; pump(); return; }
      if (E.sb.updating || E.ms.readyState !== 'open') { setTimeout(pump, 50); return; }
      try {
        if (E.nextId !== c.id || E.jump) {
          // άλμα: καθαρίζει την κατάσταση του αναλυτή και τοποθετεί το κομμάτι στη θέση του·
          // συνεχόμενα κομμάτια συνεχίζουν μόνα τους (mode 'sequence')
          E.sb.abort();
          E.sb.timestampOffset = c.pos;
          buf = prime(buf);
          trace('jump-append', c.id, c.pos, audio.currentTime);
        }
        E.jump = false;
        E.sb.appendBuffer(buf);
        E.nextId = c.id + 1;
        E.fails = 0;
      } catch (e) {
        if (e.name === 'QuotaExceededError' && E.sb.buffered.length) { try { E.sb.remove(0, Math.max(0, audio.currentTime - 10)); } catch (x) { /* */ } }
        else if (++E.fails > 3) { const p = E.seekTo != null ? E.seekTo : audio.currentTime; mseAttach(p); }   // νέο MediaSource
        else setTimeout(pump, 300);
      }
    });
  }
  function mseSeek(p) {
    trace('seek', p, audio.currentTime, inBuf(p));
    if (E.seekTo == null && inBuf(p)) { audio.currentTime = p; return; }
    E.gen++; E.busy = false; E.nextId = null; E.seekTo = p; E.flush = true; E.started = false;
    if (E.sb && E.sb.updating) { try { E.sb.abort(); } catch (e) { /* αφαίρεση σε εξέλιξη· θα συνεχίσει στο updateend */ } }
    pump();
  }

  // Εφεδρεία χωρίς MediaSource
  // live: απευθείας από τον σταθμό (μόνο όταν ζητήθηκε το ζωντανό ή φτάσαμε στο άκρο)
  async function fbStart(p, live) {
    const seq = (F ? F.seq : 0) + 1;
    if (F && F.url) URL.revokeObjectURL(F.url);
    if ((live || edge() - p < 12) && (Rec.on || remoteRec())) {
      F = { seq, mode: 'stream', base: edge() - LIVE_LAG, ready: false };
      if (rate !== 1) { setRate(1); msg('Έφτασες στο ζωντανό.'); }
      audio.src = STREAM + (STREAM.includes('?') ? '&' : '?') + 'ts=' + Date.now();
    } else {
      F = { seq, mode: 'blob', ready: false };
      const i = Math.max(0, idxAt(p));
      let j = i, d = 0;
      while (j + 1 < C.length && d < 15 * 60) { d += C[j].dur; j++; }
      const bufs = await getRange(C[i].id, C[j].id).catch(() => []);
      if (!F || F.seq !== seq) return;
      if (!bufs.length) { msg('Δεν βρέθηκαν τα αποθηκευμένα.'); want = false; render(); return; }
      F.base = C[i].pos; F.end = C[j].pos + C[j].dur; F.off = p - C[i].pos;
      bufs[0] = prime(bufs[0]);
      F.url = URL.createObjectURL(new Blob(bufs, { type: 'audio/mpeg' }));
      audio.src = F.url;
    }
    audio.playbackRate = rate;
    if (want) audio.play().catch(playFailed);
    render();
  }
  audio.addEventListener('loadedmetadata', () => {
    if (!F || F.ready) return;
    if (F.mode === 'blob') try { audio.currentTime = F.off || 0; } catch (e) { /* */ }
    F.ready = true;
  });
  function fbCheck() {
    if (!F || !F.ready || F.mode !== 'blob' || !want) return;
    const p = pos();
    if (p >= F.end - 1.2 || audio.ended) {
      // το παράθυρο φτάνει ήδη στο τέλος των αποθηκευμένων και δεν έρχονται νέα: τελειώνει εκεί
      if (F.end >= edge() - 0.1 && !Rec.on && !remoteRec()) { if (audio.ended) endOfStored(); return; }
      cur = p; fbStart(p, false);
    }
  }

  // ── Ενέργειες ───────────────────────────────────────────────────
  function claim() {
    window.__radioActive = 'live';
    window.dispatchEvent(new CustomEvent('radio-exclusive', { detail: 'live' }));
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (window.MediaMetadata) ms.metadata = new MediaMetadata({ title: 'Πειραϊκή Εκκλησία 91.2', artist: 'Ζωντανά', album: 'Ορθόδοξο Σημειωματάριο', artwork: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] });
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { /* */ } };
    set('play', play); set('pause', pause);
    set('seekbackward', d => skip(-(d && d.seekOffset || 10)));
    set('seekforward', d => skip(d && d.seekOffset || 10));
    set('seekto', d => { if (d && Number.isFinite(d.seekTime)) seek(first() + d.seekTime); });
    set('nexttrack', goLive);
    set('previoustrack', () => skip(-300));
  }
  function playFailed(e) { if (e && e.name === 'NotAllowedError') { want = false; render(); } }
  function play() {
    if (!C.length) { goLive(); return; }
    want = true; claim(); msg('');
    let p = Number.isFinite(cur) ? clamp(cur) : edge() - LIVE_LAG;
    if (p >= edge() - 1 && !Rec.on && !remoteRec()) p = Math.max(first(), edge() - 60);
    if (useMSE) {
      if (!E) mseAttach(p);
      else {
        if (E.seekTo != null || !inBuf(audio.currentTime) || Math.abs(audio.currentTime - p) > 0.5) mseSeek(p);
        if (E.seekTo == null) audio.play().catch(playFailed);
      }
    } else if (!F || !F.ready) fbStart(p, false); else audio.play().catch(playFailed);
    render();
  }
  function pause() {
    want = false;
    cur = pos();
    audio.pause();
    if (F && F.mode === 'stream') { audio.removeAttribute('src'); audio.load(); F = null; }   // να μην κατεβαίνει διπλά
    save(true); render();
  }
  function seek(p) {
    if (!C.length) return;
    p = clamp(p);
    cur = p;
    if (useMSE && E) mseSeek(p);
    else if (!useMSE && F) {
      if (F.mode === 'blob' && F.ready && p >= F.base && p < F.end - 1.5) audio.currentTime = p - F.base;
      else if (want) fbStart(p, false); else { F = null; audio.removeAttribute('src'); audio.load(); }
    }
    save(true); render();
  }
  const skip = d => seek(pos() + d);
  async function goLive() {
    msg('');
    want = true; claim();
    if (rate !== 1) setRate(1);
    if (!Rec.on && !remoteRec()) {
      // η αποθήκευση ξεκινά τώρα: περιμένουμε τα πρώτα δευτερόλεπτα της νέας σύνδεσης
      liveFrom = edge();
      if (await recStart()) { waitingFirst = true; render(); return; }
    }
    if (!C.length || edge() - liveFrom < 3) { waitingFirst = true; render(); return; }
    cur = Math.max(first(), edge() - LIVE_LAG);
    if (useMSE) { if (!E) mseAttach(cur); else mseSeek(cur); }
    else fbStart(cur, true);
    render();
  }
  let waitingFirst = false, liveFrom = 0;
  function onChunk() {
    if (waitingFirst && want && edge() - liveFrom >= 3) { waitingFirst = false; goLive(); return; }
    pump();
    renderSoon();
  }
  function endOfStored() {
    pause();
    msg('Τέλος των αποθηκευμένων. Πάτησε «Ζωντανά» για να συνεχίσεις από το τώρα.');
  }
  function setRate(r) {
    rate = r;
    audio.playbackRate = audio.defaultPlaybackRate = rate;
    render();
  }
  function reset() {
    want = false; cur = NaN; E = null; F = null; liveFrom = 0; waitingFirst = false;
    audio.pause(); audio.removeAttribute('src'); try { audio.srcObject = null; } catch (e) { /* */ }
    audio.load();
    dirty = true; render();
  }
  async function clearAll() {
    if (!confirm('Να σβηστούν όλα τα αποθηκευμένα της ζωντανής ακρόασης από τη συσκευή;')) return;
    const wasRec = Rec.on;
    if (wasRec) recStop();
    await tx(['idx', 'data'], 'readwrite', t => { t.objectStore('idx').clear(); t.objectStore('data').clear(); }).catch(() => {});
    C = []; mem.clear();
    if (bc) bc.postMessage({ type: 'clear' });
    reset();
    msg('Σβήστηκαν.');
  }

  audio.addEventListener('playing', () => { if (/Επανασύνδεση/.test($('l-msg').textContent)) msg(''); render(); });
  audio.addEventListener('waiting', render);
  audio.addEventListener('pause', () => {
    if ((E && E.seekTo != null) || (F && !F.ready)) return;       // μετάβαση σε εξέλιξη
    if (audio.ended) return;
    if (want && !audio.seeking) { want = false; cur = pos(); save(true); render(); }
  });
  audio.addEventListener('ended', () => { if (!useMSE) fbCheck(); });
  audio.addEventListener('timeupdate', () => { if (!useMSE) fbCheck(); save(false); });
  let errCount = 0, errAt = 0;
  let lastErr = '';
  audio.addEventListener('error', () => {
    lastErr = audio.error ? audio.error.code + ' ' + audio.error.message : '?';
    trace('error', audio.currentTime, lastErr);
    if (!want) return;
    if (Date.now() - errAt > 60000) errCount = 0;
    errAt = Date.now();
    const p = pos() + (++errCount > 1 ? CHUNK_S : 0);    // επαναλαμβανόμενο σφάλμα: προσπερνά το κομμάτι
    if (errCount > 4) { want = false; msg('Πρόβλημα αναπαραγωγής. Πάτησε ▶ για νέα προσπάθεια.'); E = null; F = null; render(); return; }
    msg('Επανασύνδεση…');
    cur = clamp(p); E = null; F = null;
    setTimeout(() => { if (want) play(); }, 400 * errCount);
  });

  // Κάθε μισό δευτερόλεπτο: κενά, τέλος αποθηκευμένων, εμφάνιση
  let tickAt = Date.now();
  setInterval(() => {
    const dt = Math.min(5, (Date.now() - tickAt) / 1000);
    tickAt = Date.now();
    if (F && F.mode === 'stream' && !audio.paused) addUsage(Math.round(dt * BPS), true);
    if (E && E.sb && E.started && want && !E.sb.updating) {
      const t = audio.currentTime, b = E.sb.buffered;
      // κενό μέσα στον άξονα (χαμένο κομμάτι): πήδημα στο επόμενο διαθέσιμο
      if (!inBuf(t)) for (let i = 0; i < b.length; i++) if (b.start(i) > t && b.start(i) - t < 3600) { trace('gapjump', t, b.start(i)); audio.currentTime = b.start(i); break; }
    }
    // ο σταθμός γράφεται σε άλλη καρτέλα ή καθόλου και φτάσαμε στο τέλος των αποθηκευμένων
    if (want && C.length && !Rec.on && !remoteRec() && pos() >= edge() - 0.6) endOfStored();
    // η θέση σβήστηκε (όριο «Κράτα έως» ή χώρος): συνέχεια από το παλαιότερο που υπάρχει
    if (want && C.length && pos() < first() - 1) { seek(first()); msg('Τα παλαιότερα σβήστηκαν· συνεχίζει από το παλαιότερο που υπάρχει.'); }
    // ταχύτητα πάνω από 1× που έφτασε στο ζωντανό: επιστροφή στο κανονικό
    if (want && rate > 1 && edge() - pos() < LIVE_LAG) { setRate(1); msg('Έφτασες στο ζωντανό.'); }
    pump();
    render();
  }, 500);

  function save(force) {
    if (!force && Date.now() - lastSave < 5000) return;
    lastSave = Date.now();
    if (C.length) store.set('pos', String(pos()));
  }
  window.addEventListener('pagehide', () => save(true));
  window.addEventListener('radio-exclusive', e => { if (e.detail !== 'live' && want) pause(); });

  // ── Πρόγραμμα του σταθμού ───────────────────────────────────────
  let week = null, days = null, showsCache = null;
  const loadProgram = () => fetch('/api/recordings?program=week').then(r => r.json()).then(d => { if (d.ok) { week = d.week; days = d.days; nowCache = null; dirty = true; render(); } }).catch(() => {});
  loadProgram();
  setInterval(loadProgram, 6 * 3600e3);
  // τι μεταδίδεται τώρα και μετά (υπολογίζεται το πολύ μία φορά το λεπτό)
  let nowCache = null;
  function nowShows() {
    if (!nowCache || Date.now() - nowCache.at > 60000) nowCache = { at: Date.now(), list: showsBetween(Date.now() - 6 * 3600e3, Date.now() + 12 * 3600e3) };
    return nowCache.list;
  }
  // οι εκπομπές από την ημέρα πριν το from έως το to (epoch ms)
  function showsBetween(from, to) {
    if (!week || !days) return [];
    const out = [];
    const [y, mo, d] = dateFmt.format(from).split('-').map(Number);
    for (let k = -1; ; k++) {
      const day = new Date(Date.UTC(y, mo - 1, d + k));
      const dy = day.getUTCFullYear(), dm = day.getUTCMonth() + 1, dd = day.getUTCDate();
      if (athensToEpoch(dy, dm, dd, 0, 0, 0) > to) break;
      for (const [hm, title, desc] of week[days[(day.getUTCDay() + 6) % 7]] || []) {
        const [h, mi] = String(hm).split(':').map(Number);
        if (Number.isFinite(h) && Number.isFinite(mi) && title) out.push({ start: athensToEpoch(dy, dm, dd, h, mi, 0), title: String(title), desc: String(desc || '') });
      }
      if (k > 60) break;
    }
    out.sort((a, b) => a.start - b.start);
    out.forEach((s, i) => { s.end = i + 1 < out.length ? out[i + 1].start : Infinity; });
    return out.filter(s => s.end > from && s.start <= to);
  }
  const showAtMs = (list, ms) => { let c = null; for (const s of list) if (s.start <= ms) c = s; return c; };

  // ── Εμφάνιση ────────────────────────────────────────────────────
  function msg(t) { $('l-msg').textContent = t; }
  let dragging = false, renderTimer = 0, ticksKey = '', shownShow;
  function renderSoon() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = 0; render(); }, 150); }
  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>';
  function setShow(el, s, prefix) {
    el.innerHTML = s ? '<b></b><small></small>' : '';
    if (s) { el.firstChild.textContent = (prefix || '') + s.title; el.lastChild.textContent = s.desc; }
  }
  function render() {
    const has = C.length > 0, active = Rec.on || want || has;
    const ns = nowShows();
    const nowShow = showAtMs(ns, Date.now()), next = nowShow ? ns[ns.indexOf(nowShow) + 1] : null;
    $('l-start').hidden = has || want;
    $('l-ui').hidden = !(has || want);
    // τι μεταδίδεται τώρα (πάνω, πάντα)
    const nowEl = $('l-now');
    const nowTxt = nowShow ? 'Τώρα: ' + nowShow.title + (next ? ' · Μετά, ' + hmFmt.format(next.start) + ': ' + next.title : '') : '';
    if (nowEl.textContent !== nowTxt) nowEl.textContent = nowTxt;
    const p = dragging ? first() + Number($('l-seek').value) : pos();
    const behind = Math.max(0, edge() - p);
    const atLive = has && want && (Rec.on || remoteRec()) && behind < LIVE_NEAR;
    const badge = $('l-badge');
    badge.textContent = atLive ? '● ΖΩΝΤΑΝΑ' : has && want ? '−' + fmt(behind) + ' από το ζωντανό' : '● Ζωντανά';
    badge.classList.toggle('on', atLive);
    if (!active) return;

    if (has) {
      const total = Math.max(1, Math.floor(edge() - first()));
      const sk = $('l-seek');
      sk.max = total;
      if (!dragging) sk.value = Math.min(Math.floor(p - first()), total);
      const c = clockAt(p);
      $('l-clock').innerHTML = c ? 'Ώρα μετάδοσης <b>' + clockFmt.format(c) + '</b>' : '';
      $('l-from').textContent = clockLabel(C[0].t0);
      $('l-to').textContent = Rec.on || remoteRec() ? 'τώρα' : clockLabel(clockAt(edge()));
      $('l-behind').textContent = behind >= 2 ? '−' + fmt(behind) : '';
      // εκπομπές μέσα στα αποθηκευμένα
      const key = C[0].id + ':' + (week ? 1 : 0) + ':' + Math.floor(edge() / 30);
      if (key !== ticksKey || dirty) { ticksKey = key; dirty = false; renderTicks(); }
      const show = showAtMs(showsCache || [], c);
      if (show !== shownShow) {
        shownShow = show;
        setShow($('l-show'), show);
        $('l-shows').querySelectorAll('li').forEach(li => li.classList.toggle('on', show != null && Number(li.dataset.start) === show.start));
        if ('mediaSession' in navigator && navigator.mediaSession.metadata && window.__radioActive === 'live') navigator.mediaSession.metadata.title = show ? show.title : 'Πειραϊκή Εκκλησία 91.2';
      }
      $('l-store').textContent = 'Στη συσκευή: ' + fmtDur(stored()) + ' (' + clockLabel(C[0].t0) + ' – ' + clockLabel(clockAt(edge())) + ') · ' + Math.round(bytes() / 1048576) + ' MB';
    } else {
      $('l-clock').textContent = ''; $('l-from').textContent = ''; $('l-to').textContent = ''; $('l-behind').textContent = '';
      $('l-store').textContent = 'Δεν υπάρχει ακόμα τίποτα αποθηκευμένο.';
    }
    renderUsage(has);
    const busy = want && (waitingFirst || (E && (E.seekTo != null || audio.readyState < 3)) || (F && !F.ready) || audio.readyState < 3);
    const pb = $('l-play');
    pb.innerHTML = want ? ICON_PAUSE : ICON_PLAY;
    pb.setAttribute('aria-label', want ? 'Παύση' : 'Αναπαραγωγή');
    pb.classList.toggle('busy', !!busy);
    $('l-live').classList.toggle('on', atLive);
    $('l-live').disabled = atLive;
    $('l-rate').textContent = String(rate).replace('.', ',') + '×';
    const st = $('l-rec');
    st.textContent = {
      on: '● Λήψη και αποθήκευση στη συσκευή (~' + MB_PER_H + ' MB την ώρα), όσο είναι ανοιχτή η σελίδα',
      connecting: 'Σύνδεση με τον σταθμό…',
      retry: 'Χάθηκε η σύνδεση με τον σταθμό· νέα προσπάθεια…',
      offline: 'Χωρίς σύνδεση στο διαδίκτυο· θα συνεχίσει μόλις επανέλθει.',
      remote: '● Αποθηκεύεται από άλλη καρτέλα αυτής της σελίδας',
      off: Rec.err || 'Η λήψη είναι σταματημένη· δεν καταναλώνονται δεδομένα.',
    }[Rec.on ? Rec.state : remoteRec() ? 'remote' : 'off'];
    st.classList.toggle('on', Rec.on && Rec.state === 'on' || remoteRec());
    $('l-recbtn').textContent = Rec.on ? 'Σταμάτα τη λήψη' : 'Ξεκίνα τη λήψη';
    $('l-recbtn').disabled = !Rec.on && remoteRec();
    if ('mediaSession' in navigator && window.__radioActive === 'live') {
      navigator.mediaSession.playbackState = want ? 'playing' : 'paused';
      if (has) try { navigator.mediaSession.setPositionState({ duration: Math.max(1, edge() - first()), position: Math.min(Math.max(0, p - first()), edge() - first()), playbackRate: rate }); } catch (e) { /* */ }
    }
  }
  let listKey = '';
  // Τι κοστίζει: πριν την έναρξη, κατά την ακρόαση, στην παύση
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  function renderInfo() {
    const keep = Number.isFinite(keepH) ? 'έως ' + (keepH === 1 ? '1 ώρα' : keepH + ' ώρες') + ' (περίπου ' + gbh(keepH) + ')' : 'όσο χωράει στη συσκευή';
    $('l-cost').textContent = (useMSE
      ? 'Η ροή του σταθμού κατεβαίνει μία φορά: περίπου ' + MB_PER_H + ' MB δεδομένων την ώρα, για όσο είναι ανοιχτή η σελίδα, ακόμη και σε παύση. '
      : 'Σε αυτή τη συσκευή, όσο ακούς ζωντανά, η ροή κατεβαίνει δύο φορές (μία για να την ακούς και μία για να φυλάγεται): περίπου ' + 2 * MB_PER_H + ' MB την ώρα· όταν γυρίσεις πίσω ή σε παύση, περίπου ' + MB_PER_H + ' MB την ώρα. ')
      + 'Στη συσκευή φυλάγονται ' + keep + '· τα παλαιότερα σβήνονται αυτόματα. Μπορείς να σταματήσεις τη λήψη και να σβήσεις τα αποθηκευμένα όποτε θέλεις.';
    const cell = conn && (conn.type === 'cellular' || conn.saveData);
    const w = $('l-warn');
    w.hidden = !cell;
    if (cell) w.textContent = conn.saveData ? 'Έχεις ενεργή την εξοικονόμηση δεδομένων. Η ζωντανή ακρόαση με επιστροφή καταναλώνει περίπου ' + MB_PER_H + ' MB την ώρα.' : 'Φαίνεται ότι είσαι σε δεδομένα κινητού. Η ζωντανή ακρόαση με επιστροφή καταναλώνει περίπου ' + MB_PER_H + ' MB την ώρα από το πακέτο σου.';
    $('l-how').textContent = useMSE
      ? 'Σε αυτή τη συσκευή ακούς από τα ίδια κομμάτια που φυλάγονται, γι’ αυτό το «ζωντανά» είναι λίγα δευτερόλεπτα πίσω από τον σταθμό και η ροή κατεβαίνει μία φορά.'
      : 'Αυτή η συσκευή δεν μπορεί να παίζει συνεχόμενα από τα φυλαγμένα κομμάτια· όσο ακούς ζωντανά παίζει απευθείας από τον σταθμό, ενώ η σελίδα κατεβάζει παράλληλα τη ροή για να τη φυλάει (διπλή λήψη). Όταν γυρίσεις πίσω, παίζει από τα φυλαγμένα, με ένα στιγμιαίο κόψιμο κάθε λίγα λεπτά.';
  }
  function renderUsage(has) {
    const direct = usage.direct > 0 ? ' + ' + mb(usage.direct) + ' απευθείας (εκτίμηση)' : '';
    const u = 'Λήψη σε αυτή την ακρόαση: ' + mb(usage.sess) + direct + (has ? ' · Στη συσκευή: ' + fmtDur(stored()) + ' (' + mb(bytes()) + ')' : '');
    if ($('l-usage').textContent !== u) $('l-usage').textContent = u;
    const t = 'Δεδομένα για τη ζωντανή ακρόαση σε αυτή τη συσκευή: σήμερα ' + mb(usage.day === dateFmt.format(Date.now()) ? usage.dayB : 0) + ', αυτόν τον μήνα ' + mb(usage.month === dateFmt.format(Date.now()).slice(0, 7) ? usage.monthB : 0) + '.';
    if ($('l-totals').textContent !== t) $('l-totals').textContent = t;
    const paused = !want && Rec.on;
    $('l-pause').hidden = !paused;
    if (paused) $('l-pause-t').textContent = 'Σε παύση· η λήψη συνεχίζεται (~' + MB_PER_H + ' MB την ώρα), για να συνεχίσεις από εδώ ή να πας στο ζωντανό χωρίς κενό.';
  }

  function renderTicks() {
    const ticks = $('l-ticks'), box = $('l-shows');
    ticks.innerHTML = '';
    if (!C.length) { box.innerHTML = ''; box.hidden = true; listKey = ''; showsCache = []; return; }
    const a = first(), total = Math.max(1, edge() - a);
    const place = (el, at) => { el.style.left = 'calc(8px + (100% - 16px) * ' + ((at - a) / total).toFixed(5) + ')'; ticks.appendChild(el); };
    // διαστήματα με ήχο (σε ώρα μετάδοσης)
    const cover = [];
    for (const c of C) {
      if (c.gap) { const i = document.createElement('i'); i.className = 'gap'; i.title = 'Κενό· η σελίδα ήταν κλειστή ή χωρίς σύνδεση'; place(i, c.pos); }
      const e = c.t0 + c.dur * 1000, l = cover[cover.length - 1];
      if (l && c.t0 <= l[1] + 3000) l[1] = Math.max(l[1], e); else cover.push([c.t0, e]);
    }
    showsCache = showsBetween(C[0].t0, cover[cover.length - 1][1]).filter(s => cover.some(([x, y]) => x < s.end && y > s.start));
    for (const s of showsCache) {
      const at = posAtClock(s.start);
      if (at != null && at > a + 1 && at < edge() - 1) { const i = document.createElement('i'); i.title = s.title; place(i, at); }
    }
    const lk = showsCache.map(s => s.start).join();
    if (lk !== listKey) {
      listKey = lk;
      box.innerHTML = '';
      box.hidden = !showsCache.length;
      for (const s of showsCache) {
        const li = document.createElement('li');
        li.dataset.start = s.start;
        li.innerHTML = '<time></time><span class="sh-t"></span>';
        li.firstChild.textContent = clockLabel(s.start);
        li.lastChild.textContent = s.title;
        if (s.desc) { const sm = document.createElement('small'); sm.textContent = s.desc; li.lastChild.appendChild(sm); }
        li.addEventListener('click', () => { const at = posAtClock(s.start); seek(at == null ? first() : at); if (!want) play(); });
        box.appendChild(li);
      }
    }
    shownShow = undefined;
  }

  // ── Χειριστήρια ─────────────────────────────────────────────────
  $('l-go').addEventListener('click', goLive);
  $('l-play').addEventListener('click', () => (want ? pause() : play()));
  $('l-live').addEventListener('click', goLive);
  for (const [id, d] of [['l-b30', -30], ['l-b10', -10], ['l-f10', 10], ['l-f30', 30], ['l-b5m', -300], ['l-b15m', -900], ['l-b1h', -3600]]) {
    $(id).addEventListener('click', () => { if (!C.length) return; skip(d); if (!want) play(); });
  }
  $('l-rate').addEventListener('click', () => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]));
  const sk = $('l-seek');
  sk.addEventListener('input', () => { dragging = true; render(); });
  sk.addEventListener('change', () => { dragging = false; seek(first() + Number(sk.value)); });
  sk.addEventListener('pointerup', () => { if (dragging) { dragging = false; seek(first() + Number(sk.value)); } });
  sk.addEventListener('blur', () => { dragging = false; });
  $('l-jump').addEventListener('submit', e => {
    e.preventDefault();
    const [h, m, s] = $('l-jc').value.split(':').map(Number);
    if (!Number.isFinite(h) || !C.length) return;
    // η πιο πρόσφατη φορά που ήταν αυτή η ώρα, μέσα στα αποθηκευμένα
    const [y, mo, d] = dateFmt.format(Date.now()).split('-').map(Number);
    for (let k = 0; k <= 3; k++) {
      const day = new Date(Date.UTC(y, mo - 1, d - k));
      const ms = athensToEpoch(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h, m || 0, s || 0);
      if (ms > clockAt(edge())) continue;
      const p = posAtClock(ms);
      if (p == null) break;
      msg(ms < C[0].t0 ? 'Τα αποθηκευμένα αρχίζουν στις ' + clockLabel(C[0].t0, clockFmt) + '.' : '');
      seek(p); if (!want) play();
      return;
    }
    msg('Δεν υπάρχει αποθηκευμένο για αυτή την ώρα. Τα αποθηκευμένα είναι ' + clockLabel(C[0].t0) + ' – ' + clockLabel(clockAt(edge())) + '.');
  });
  $('l-recbtn').addEventListener('click', () => (Rec.on ? recStop() : recStart()));
  $('l-clear').addEventListener('click', clearAll);
  $('l-pause-stop').addEventListener('click', () => recStop());
  const keepSel = $('l-keep');
  for (const h of KEEP_OPTS) {
    const o = document.createElement('option');
    o.value = Number.isFinite(h) ? String(h) : 'inf';
    o.textContent = Number.isFinite(h) ? (h === 1 ? '1 ώρα' : h + ' ώρες') + ' (~' + gbh(h) + ')' : 'Όσο χωράει στη συσκευή';
    if (h === keepH) o.selected = true;
    keepSel.appendChild(o);
  }
  keepSel.addEventListener('change', () => {
    keepH = keepSel.value === 'inf' ? Infinity : Number(keepSel.value);
    store.set('keep', keepSel.value);
    renderInfo();
    evictByKeep().then(render);
  });
  document.addEventListener('keydown', e => {
    if (window.__radioActive !== 'live' || !C.length || e.target.closest('input, textarea, select, button') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); want ? pause() : play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(e.shiftKey ? -30 : -10); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); skip(e.shiftKey ? 30 : 10); }
    else if (e.key === 'l' || e.key === 'End') { e.preventDefault(); goLive(); }
  });
  async function showQuota() {
    try {
      const q = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      if (q && q.quota) $('l-quota').textContent = 'Διαθέσιμος χώρος για τη σελίδα στη συσκευή: περίπου ' + Math.max(0, (q.quota - q.usage) / 1073741824).toFixed(1).replace('.', ',') + ' GB (≈ ' + Math.floor((q.quota - q.usage) / 1048576 / MB_PER_H) + ' ώρες).';
    } catch (e) { /* */ }
  }
  $('l-more').addEventListener('toggle', () => { if ($('l-more').open) showQuota(); });

  // ── Εκκίνηση ────────────────────────────────────────────────────
  renderInfo();
  if (conn && conn.addEventListener) conn.addEventListener('change', renderInfo);
  if (!window.indexedDB || !window.fetch || !window.ReadableStream) { root.hidden = true; return; }
  tx(['idx'], 'readonly', t => { const r = t.objectStore('idx').getAll(); return () => r.result || []; })
    .then(list => {
      C = list.sort((a, b) => a.id - b.id);
      if (!Number.isFinite(cur) || cur < first() || cur > edge()) cur = NaN;
      return evictByKeep();
    })
    .catch(() => { /* IndexedDB μη διαθέσιμο (π.χ. ιδιωτική περιήγηση σε παλιό Firefox) */ })
    .then(() => { dirty = true; render(); });
  render();
  window.RadioLive = { get chunks() { return C; }, pos, edge, first, goLive, play, pause, seek, recStop, useMSE, get rec() { return Rec; },
    get trace() { return TR; }, get usage() { return usage; },
    get debug() { const b = E && E.sb ? E.sb.buffered : null; return { lastErr, want, cur, seekTo: E && E.seekTo, started: E && E.started, busy: E && E.busy, t: audio.currentTime, paused: audio.paused, rs: audio.readyState, buf: b ? Array.from({ length: b.length }, (_, i) => [b.start(i), b.end(i)]) : null, F: F && { mode: F.mode, ready: F.ready, base: F.base, end: F.end } }; } };
})();

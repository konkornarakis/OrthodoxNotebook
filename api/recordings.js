// api/recordings.js — ηχογραφήσεις της Πειραϊκής Εκκλησίας (91.2) για τη σελίδα radio.html
//
// GET /api/recordings             →  { ok, nights: [{ tag, date, title, growing, segments: [{ id, start, dur, size }] }] }
// GET /api/recordings?asset=<id>  →  302 προς προσωρινό σύνδεσμο του mp3
//
// Τα mp3 ανεβαίνουν από το workflow record-peiraiki.yml ως assets σε GitHub Releases (tag rec-ΕΕΕΕ-ΜΜ-ΗΗ),
// σε κομμάτια των 10 λεπτών με όνομα peiraiki_ΕΕΕΕ-ΜΜ-ΗΗ_ΩΩ-ΛΛ-ΔΔ.mp3 (ώρα έναρξης, ώρα Ελλάδας).
// Η σελίδα τα ενώνει σε μία συνεχή ηχογράφηση· growing σημαίνει ότι η βραδιά ακόμη μεγαλώνει.
//
// Ρυθμίσεις στη Vercel: GITHUB_TOKEN (υπάρχει ήδη για το admin.js), RECORDINGS_REPO (προαιρετικό).

'use strict';

const REPO = process.env.RECORDINGS_REPO || process.env.GITHUB_REPO || 'konkornarakis/OrthodoxNotebook';
const API = 'https://api.github.com/repos/' + REPO;
const KBPS = 96;   // όπως στο workflow (libmp3lame -b:a 96k)
const MIN_BYTES = 24 * 1024;   // ~2 δευτερόλεπτα

function gh(path, opts = {}) {
  const headers = { Accept: opts.accept || 'application/vnd.github+json', 'User-Agent': 'orthodox-notebook' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return fetch(API + path, { method: opts.method || 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}

const isTrack = name => /^peiraiki_.*\.mp3$/.test(name);

// Ώρα Ελλάδας «ΕΕΕΕ-ΜΜ-ΗΗ ΩΩ:ΛΛ:ΔΔ» → epoch ms (η διαφορά από UTC βρίσκεται με Intl, ώστε να ισχύει και η θερινή ώρα)
function athensToEpoch(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(guess)).reduce((o, p) => (o[p.type] = +p.value, o), {});
  const asAthens = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return guess - (asAthens - guess);
}

function segmentStart(name) {
  const m = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.mp3$/.exec(name);
  return m ? athensToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : null;
}

// Κατάσταση που γράφει το workflow στο κείμενο του release: <!--status:{...}-->
function parseStatus(body) {
  const m = /<!--status:(\{.*?\})-->/.exec(body || '');
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

async function releases() {
  const r = await gh('/releases?per_page=100');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return (await r.json()).filter(rel => /^rec-\d{4}-\d{2}-\d{2}$/.test(rel.tag_name));
}

function night(rel) {
  // Τα πολύ μικρά αρχεία είναι υπόλοιπα από διακοπή πάνω στο όριο κομματιού (χωρίς ήχο).
  const segments = rel.assets.filter(a => isTrack(a.name) && a.state === 'uploaded' && a.size >= MIN_BYTES)
    .map(a => ({ id: a.id, name: a.name, start: segmentStart(a.name), size: a.size, dur: Math.max(1, Math.round((a.size - 1000) * 8 / (KBPS * 1000))) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const status = parseStatus(rel.body);
  const now = Date.now();
  const last = segments[segments.length - 1];
  // «Μεγαλώνει» όσο το workflow δηλώνει ότι γράφει (με πρόσφατη ενημέρωση) ή αν το τελευταίο κομμάτι είναι πολύ πρόσφατο.
  const growing = !!((status && status.recording && now - status.updated * 1000 < 25 * 60e3) ||
    (last && last.start && now - last.start < 22 * 60e3));
  return { id: rel.id, tag: rel.tag_name, date: rel.tag_name.slice(4), title: rel.name || rel.tag_name, growing, status, segments };
}

async function nights() {
  return (await releases()).map(night).filter(n => n.segments.length).sort((a, b) => b.date.localeCompare(a.date));
}

// Το GitHub απαντά με 302 προς υπογεγραμμένο σύνδεσμο που ισχύει λίγα λεπτά·
// η σελίδα ζητά καινούριο αν λήξει πάνω στην αναπαραγωγή.
async function assetUrl(id) {
  const meta = await gh('/releases/assets/' + id);
  if (!meta.ok || !isTrack((await meta.json()).name)) return null;
  const r = await gh('/releases/assets/' + id, { accept: 'application/octet-stream' });
  return r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
}

async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (q.has('asset')) {
      const id = q.get('asset');
      const url = /^\d+$/.test(id) ? await assetUrl(id) : null;
      res.setHeader('Cache-Control', 'no-store');
      if (!url) { res.statusCode = 404; res.end('Δεν βρέθηκε'); return; }
      res.statusCode = 302;
      res.setHeader('Location', url);
      res.end();
      return;
    }
    const list = (await nights()).map(n => ({
      tag: n.tag, date: n.date, title: n.title, growing: n.growing,
      segments: n.segments.map(s => ({ id: s.id, start: s.start, dur: s.dur, size: s.size })),
    }));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=20, stale-while-revalidate=40');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, nights: list }));
  } catch (err) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: err.name === 'TimeoutError' ? 'Λήξη χρόνου' : err.message }));
  }
}

module.exports = handler;
module.exports.nights = nights;
module.exports.gh = gh;
module.exports.athensToEpoch = athensToEpoch;

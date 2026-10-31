// api/recordings.js — ηχογραφήσεις της Πειραϊκής Εκκλησίας (91.2) για τη σελίδα radio.html
//
// GET /api/recordings                 →  { ok, nights: [{ tag, date, dur, size, growing, titles, from, to }] }   (όλες οι ημέρες, ελαφριά λίστα)
// GET /api/recordings?night=<tag>     →  { ok, night: { tag, date, growing, segments: [{ id, start, dur, size }], shows: [{ start, title, desc }] } }
// GET /api/recordings?asset=<id>      →  302 προς προσωρινό σύνδεσμο του mp3
//
// Τα mp3 ανεβαίνουν από το workflow record-peiraiki.yml ως assets σε GitHub Releases (tag rec-ΕΕΕΕ-ΜΜ-ΗΗ),
// σε κομμάτια των 10 λεπτών με όνομα peiraiki_ΕΕΕΕ-ΜΜ-ΗΗ_ΩΩ-ΛΛ-ΔΔ[_ΝΝk].mp3 (ώρα έναρξης σε ώρα Ελλάδας, kbps).
// Η σελίδα τα ενώνει σε μία συνεχή ηχογράφηση· growing σημαίνει ότι η ημέρα ακόμη μεγαλώνει.
// Στο κείμενο κάθε release το workflow γράφει <!--status:{...}--> και <!--program:{...}--> (εκπομπές του σταθμού).
//
// Ρυθμίσεις στη Vercel: GITHUB_TOKEN (υπάρχει ήδη για το admin.js), RECORDINGS_REPO (προαιρετικό).

'use strict';

const { athensToEpoch } = require('../radio/schedule.js');

const REPO = process.env.RECORDINGS_REPO || process.env.GITHUB_REPO || 'konkornarakis/OrthodoxNotebook';
const API = 'https://api.github.com/repos/' + REPO;
const DEFAULT_KBPS = 96;           // τα πρώτα κομμάτια δεν έχουν kbps στο όνομα
const MIN_BYTES = 24 * 1024;       // μικρότερα αρχεία είναι υπόλοιπα χωρίς ήχο

function gh(path, opts = {}) {
  const headers = { Accept: opts.accept || 'application/vnd.github+json', 'User-Agent': 'orthodox-notebook' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return fetch(API + path, { method: opts.method || 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}

const isTrack = name => /^peiraiki_.*\.mp3$/.test(name);

function parseName(name) {
  const m = /_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:_(\d+)k)?\.mp3$/.exec(name);
  return m ? { start: athensToEpoch(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]), kbps: m[7] ? +m[7] : DEFAULT_KBPS } : { start: null, kbps: DEFAULT_KBPS };
}

function parseMarker(body, name) {
  const m = new RegExp('<!--' + name + ':(\\{.*?\\})-->').exec(body || '');
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

// Τα διαστήματα που υπάρχει ήχος (κομμάτια που απέχουν λιγότερο από 1′ ενώνονται)
function coverage(segments) {
  const out = [];
  for (const s of segments) {
    if (!s.start) continue;
    const e = s.start + s.dur * 1000, last = out[out.length - 1];
    if (last && s.start <= last[1] + 60e3) last[1] = Math.max(last[1], e); else out.push([s.start, e]);
  }
  return out;
}

// Οι εκπομπές του σταθμού που ακούγονται μέσα στις ηχογραφήσεις της ημέρας
function showsFor(program, cover) {
  if (!program || !program.days || !cover.length) return [];
  const items = [];
  for (const [date, rows] of Object.entries(program.days)) {
    const [y, mo, d] = date.split('-').map(Number);
    for (const [hm, title, desc] of rows || []) {
      const [h, mi] = String(hm).split(':').map(Number);
      if (Number.isFinite(h) && Number.isFinite(mi) && title) items.push({ start: athensToEpoch(y, mo, d, h, mi, 0), title: String(title), desc: String(desc || '') });
    }
  }
  items.sort((a, b) => a.start - b.start);
  return items.filter((it, i) => {
    const end = i + 1 < items.length ? items[i + 1].start : Infinity;
    return cover.some(([s, e]) => end > s && it.start < e);
  });
}

async function releases() {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const r = await gh('/releases?per_page=100&page=' + page);
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const list = await r.json();
    out.push(...list.filter(rel => /^rec-\d{4}-\d{2}-\d{2}$/.test(rel.tag_name)));
    if (list.length < 100) break;
  }
  return out;
}

function night(rel) {
  const segments = rel.assets.filter(a => isTrack(a.name) && a.state === 'uploaded' && a.size >= MIN_BYTES)
    .map(a => {
      const { start, kbps } = parseName(a.name);
      return { id: a.id, name: a.name, start, kbps, size: a.size, dur: Math.max(1, Math.round((a.size - 1000) * 8 / (kbps * 1000))) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const status = parseMarker(rel.body, 'status');
  // ενιαίο αρχείο χωρίς ώρα στο όνομα: η ώρα έναρξης από την κατάσταση, αν υπάρχει
  if (segments.length && segments.some(x => !x.start) && status && status.since) {
    let t = status.since * 1000;
    for (const x of segments) { x.start = t; t += x.dur * 1000; }
  }
  const now = Date.now();
  const last = segments[segments.length - 1];
  // «Μεγαλώνει» όσο το workflow δηλώνει ότι γράφει (με πρόσφατη ενημέρωση) ή αν το τελευταίο κομμάτι είναι πολύ πρόσφατο.
  const growing = !!((status && status.recording && now - status.updated * 1000 < 25 * 60e3) ||
    (last && last.start && now - last.start < 22 * 60e3));
  const shows = showsFor(parseMarker(rel.body, 'program'), coverage(segments));
  return {
    id: rel.id, tag: rel.tag_name, date: rel.tag_name.slice(4), title: rel.name || rel.tag_name, growing, status, segments, shows,
    dur: segments.reduce((a, s) => a + s.dur, 0), size: segments.reduce((a, s) => a + s.size, 0),
  };
}

const titlesOf = shows => [...new Set(shows.map(s => s.title))];

async function nights() {
  return (await releases()).map(night).filter(n => n.segments.length).sort((a, b) => b.date.localeCompare(a.date));
}

async function nightByTag(tag) {
  const r = await gh('/releases/tags/' + encodeURIComponent(tag));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return night(await r.json());
}

// Το GitHub απαντά με 302 προς υπογεγραμμένο σύνδεσμο που ισχύει λίγα λεπτά·
// η σελίδα ζητά καινούριο αν λήξει πάνω στην αναπαραγωγή.
async function assetUrl(id) {
  const meta = await gh('/releases/assets/' + id);
  if (!meta.ok || !isTrack((await meta.json()).name)) return null;
  const r = await gh('/releases/assets/' + id, { accept: 'application/octet-stream' });
  return r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
}

function json(res, status, obj, cache) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(obj));
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
    if (q.has('night')) {
      const tag = q.get('night');
      const n = /^rec-\d{4}-\d{2}-\d{2}$/.test(tag) ? await nightByTag(tag) : null;
      if (!n || !n.segments.length) return json(res, 404, { ok: false, error: 'Δεν βρέθηκε' });
      return json(res, 200, { ok: true, night: { tag: n.tag, date: n.date, growing: n.growing, shows: n.shows,
        segments: n.segments.map(s => ({ id: s.id, start: s.start, dur: s.dur, size: s.size })) } }, 'public, s-maxage=15, stale-while-revalidate=30');
    }
    const list = (await nights()).map(n => {
      const first = n.segments[0], last = n.segments[n.segments.length - 1];
      return { tag: n.tag, date: n.date, dur: n.dur, size: n.size, growing: n.growing, titles: titlesOf(n.shows),
        from: first.start, to: last.start ? last.start + last.dur * 1000 : null };
    });
    return json(res, 200, { ok: true, nights: list }, 'public, s-maxage=20, stale-while-revalidate=40');
  } catch (err) {
    return json(res, 502, { ok: false, error: err.name === 'TimeoutError' ? 'Λήξη χρόνου' : err.message });
  }
}

module.exports = handler;
module.exports.nights = nights;
module.exports.nightByTag = nightByTag;
module.exports.gh = gh;

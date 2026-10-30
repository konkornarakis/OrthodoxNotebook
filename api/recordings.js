// api/recordings.js — ηχογραφήσεις της Πειραϊκής Εκκλησίας (91.2) για τη σελίδα radio.html
//
// GET /api/recordings             →  { ok, recordings: [{ tag, title, live, tracks: [{ id, name, size }] }] }
// GET /api/recordings?asset=<id>  →  302 προς προσωρινό σύνδεσμο του mp3
//
// Τα mp3 ανεβαίνουν από το workflow record-peiraiki.yml ως assets σε GitHub Releases (tag rec-ΕΕΕΕ-ΜΜ-ΗΗ).
// Όσο γράφει, το release έχει κομμάτια των 10 λεπτών· στο τέλος ένα ενιαίο *_olokliro.mp3.
// Το repository είναι ιδιωτικό, οπότε η λήψη περνά από εδώ με το GITHUB_TOKEN της Vercel.
//
// Ρυθμίσεις στη Vercel:
//   GITHUB_TOKEN       (υπάρχει ήδη για το admin.js· αρκεί «Contents: Read»)
//   RECORDINGS_REPO    προαιρετικό, προεπιλογή το GITHUB_REPO ή konkornarakis/OrthodoxNotebook

'use strict';

const REPO = process.env.RECORDINGS_REPO || process.env.GITHUB_REPO || 'konkornarakis/OrthodoxNotebook';
const API = 'https://api.github.com/repos/' + REPO;

function gh(path, accept) {
  const headers = { Accept: accept || 'application/vnd.github+json', 'User-Agent': 'orthodox-notebook' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  return fetch(API + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}

const isTrack = name => /^peiraiki_.*\.mp3$/.test(name);

async function list() {
  const r = await gh('/releases?per_page=60');
  if (!r.ok) throw new Error('GitHub ' + r.status);
  return (await r.json())
    .filter(rel => /^rec-/.test(rel.tag_name))
    .map(rel => {
      const tracks = rel.assets.filter(a => isTrack(a.name) && a.state === 'uploaded')
        .map(a => ({ id: a.id, name: a.name, size: a.size }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { tag: rel.tag_name, title: rel.name || rel.tag_name, live: !tracks.some(t => t.name.includes('olokliro')), tracks };
    })
    .filter(rel => rel.tracks.length);
}

// Το GitHub απαντά με 302 προς υπογεγραμμένο σύνδεσμο που ισχύει λίγα λεπτά·
// η σελίδα ζητά καινούριο αν λήξει πάνω στην αναπαραγωγή.
async function assetUrl(id) {
  const meta = await gh('/releases/assets/' + id);
  if (!meta.ok) return null;
  if (!isTrack((await meta.json()).name)) return null;
  const r = await gh('/releases/assets/' + id, 'application/octet-stream');
  return r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
}

async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (q.has('asset')) {
      const id = q.get('asset');
      const url = /^\d+$/.test(id) ? await assetUrl(id) : null;
      if (!url) { res.statusCode = 404; res.end('Δεν βρέθηκε'); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 302;
      res.setHeader('Location', url);
      res.end();
      return;
    }
    const recordings = await list();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, recordings }));
  } catch (err) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: err.name === 'TimeoutError' ? 'Λήξη χρόνου' : err.message }));
  }
}

module.exports = handler;

// api/admin.js — διαχείριση ομιλιών από το live site
//
// POST /api/admin   { action: 'check' | 'create' | 'edit' | 'delete', ... }
// Κεφαλίδα: X-Admin-Password: <κωδικός>
//
// Δεν υπάρχει βάση δεδομένων: κάθε αλλαγή γίνεται commit στο GitHub (φάκελος sermons/),
// και η Vercel χτίζει ξανά το site μόνη της (generate-data.js → sermons-data.json).
//
// Ρυθμίσεις στη Vercel (Settings → Environment Variables):
//   ADMIN_PASSWORD   ο κωδικός της σελίδας διαχείρισης
//   GITHUB_TOKEN     fine-grained token με «Contents: Read and write» μόνο για αυτό το repository
//   GITHUB_REPO      προαιρετικό, προεπιλογή konkornarakis/OrthodoxNotebook
//   GITHUB_BRANCH    προαιρετικό, προεπιλογή main

'use strict';

const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'konkornarakis/OrthodoxNotebook';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com/repos/' + REPO;

function sanitizeName(s) {
  return String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 150);
}
function validId(id) { return typeof id === 'string' && id === sanitizeName(id) && id.length > 0; }

function passwordOk(given) {
  const want = process.env.ADMIN_PASSWORD || '';
  if (!want || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

async function gh(path, opts = {}) {
  const res = await fetch(API + path, Object.assign({}, opts, {
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'orthodox-notebook-admin',
      'Content-Type': 'application/json',
    },
  }));
  if (res.status === 404 && opts.allow404) return null;
  if (!res.ok) throw new Error('GitHub ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

// Τα αρχεία ενός φακέλου ομιλίας (κενός πίνακας αν δεν υπάρχει)
async function listFolder(folder) {
  const list = await gh('/contents/' + encodeURIComponent('sermons/' + folder).replace(/%2F/g, '/') + '?ref=' + BRANCH, { allow404: true });
  return Array.isArray(list) ? list.map(f => f.path) : [];
}

// Ένα commit με όλες τις αλλαγές μαζί (γράψιμο και σβήσιμο αρχείων)
async function commit(message, writes, deletes) {
  const ref = await gh('/git/ref/heads/' + BRANCH);
  const head = ref.object.sha;
  const base = await gh('/git/commits/' + head);
  const tree = [];
  for (const [path, content] of Object.entries(writes)) tree.push({ path, mode: '100644', type: 'blob', content });
  for (const path of deletes) if (!(path in writes)) tree.push({ path, mode: '100644', type: 'blob', sha: null });
  const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) });
  const c = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
  await gh('/git/refs/heads/' + BRANCH, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
  return c.sha;
}

function filesFor(folder, b) {
  const details = [];
  const one = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
  if (one(b.sourceUrl)) details.push('url: ' + one(b.sourceUrl));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(b.date))) details.push('date: ' + one(b.date));
  if (one(b.tags)) details.push('tags: ' + one(b.tags));
  const dir = 'sermons/' + folder + '/';
  return {
    [dir + '_Details.txt']: details.join('\n'),
    [dir + '_Summary.txt']: String(b.summary || '').trim(),
    [dir + folder + '_Transcript.txt']: String(b.transcript || '').replace(/\r\n/g, '\n').trim(),
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Μόνο POST.' });
  if (!process.env.ADMIN_PASSWORD || !process.env.GITHUB_TOKEN) {
    return send(res, 503, { ok: false, error: 'Η διαχείριση δεν έχει ρυθμιστεί ακόμη (λείπουν ADMIN_PASSWORD ή GITHUB_TOKEN στη Vercel).' });
  }
  if (!passwordOk(req.headers['x-admin-password'])) {
    await new Promise(r => setTimeout(r, 1200));   // αργή απάντηση σε λάθος κωδικό
    return send(res, 401, { ok: false, error: 'Λάθος κωδικός.' });
  }

  let b;
  try { b = await readBody(req); } catch (e) { return send(res, 400, { ok: false, error: 'Μη έγκυρα δεδομένα.' }); }

  try {
    if (b.action === 'check') return send(res, 200, { ok: true });

    if (b.action === 'create' || b.action === 'edit') {
      const title = sanitizeName(b.title), speaker = sanitizeName(b.speaker);
      if (!title) return send(res, 400, { ok: false, error: 'Ο τίτλος είναι υποχρεωτικός.' });
      const folder = speaker ? title + ' - ' + speaker : title;
      const existing = await listFolder(folder);
      let deletes = [];
      if (b.action === 'create') {
        if (existing.length) return send(res, 409, { ok: false, error: 'Υπάρχει ήδη ομιλία με αυτόν τον τίτλο και ομιλητή.' });
      } else {
        if (!validId(b.id)) return send(res, 400, { ok: false, error: 'Άγνωστη ομιλία.' });
        const old = await listFolder(b.id);
        if (!old.length) return send(res, 404, { ok: false, error: 'Δεν βρέθηκε η ομιλία.' });
        if (b.id !== folder && existing.length) return send(res, 409, { ok: false, error: 'Υπάρχει ήδη ομιλία με αυτόν τον τίτλο και ομιλητή.' });
        deletes = old;
      }
      const sha = await commit((b.action === 'create' ? 'Νέα ομιλία: ' : 'Διόρθωση ομιλίας: ') + folder, filesFor(folder, b), deletes);
      return send(res, 200, { ok: true, id: folder, commit: sha });
    }

    if (b.action === 'delete') {
      if (!validId(b.id)) return send(res, 400, { ok: false, error: 'Άγνωστη ομιλία.' });
      const old = await listFolder(b.id);
      if (!old.length) return send(res, 404, { ok: false, error: 'Δεν βρέθηκε η ομιλία.' });
      const sha = await commit('Διαγραφή ομιλίας: ' + b.id, {}, old);
      return send(res, 200, { ok: true, commit: sha });
    }

    return send(res, 400, { ok: false, error: 'Άγνωστη ενέργεια.' });
  } catch (e) {
    return send(res, 502, { ok: false, error: 'Η αποθήκευση απέτυχε: ' + e.message });
  }
}

module.exports = handler;
module.exports.sanitizeName = sanitizeName;

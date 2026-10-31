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
const recordings = require('./recordings.js');

const REPO = process.env.GITHUB_REPO || 'konkornarakis/OrthodoxNotebook';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const API = 'https://api.github.com/repos/' + REPO;

function sanitizeName(s) {
  return String(s || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 150);
}
// Όνομα φακέλου: μόνο ο τίτλος, κομμένος σε λέξη ώστε να χωρά άνετα (τα ελληνικά πιάνουν 2 bytes ανά γράμμα·
// τα ονόματα αρχείων δεν πρέπει να ξεπερνούν τα 255 bytes). Ο πλήρης τίτλος και ο ομιλητής μπαίνουν στο _Details.txt.
const MAX_FOLDER_BYTES = 90;
function folderName(title) {
  let out = '';
  for (const w of sanitizeName(title).split(' ')) {
    const next = out ? out + ' ' + w : w;
    if (Buffer.byteLength(next) > MAX_FOLDER_BYTES) break;
    out = next;
  }
  if (!out) out = Array.from(sanitizeName(title)).reduce((a, ch) => Buffer.byteLength(a + ch) <= MAX_FOLDER_BYTES ? a + ch : a, '');
  return out.replace(/[\s.]+$/, '');
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
  const one = v => String(v || '').replace(/[\r\n]+/g, ' ').trim();
  if (one(b.title)) details.push('title: ' + one(b.title));
  if (one(b.speaker)) details.push('speaker: ' + one(b.speaker));
  if (one(b.sourceUrl)) details.push('url: ' + one(b.sourceUrl));
  if (/^\d{4}-\d{2}-\d{2}$/.test(one(b.date))) details.push('date: ' + one(b.date));
  if (one(b.tags)) details.push('tags: ' + one(b.tags));
  const dir = 'sermons/' + folder + '/';
  const out = {
    [dir + '_Details.txt']: details.join('\n') + '\n',
    [dir + '_Summary.txt']: String(b.summary || '').trim(),
  };
  const tr = String(b.transcript || '').replace(/\r\n/g, '\n').trim();
  if (tr) out[dir + '_Transcript.txt'] = tr;
  const study = String(b.study || '').replace(/\r\n/g, '\n').trim();
  if (study) out[dir + '_Keimeno.md'] = study;
  return out;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

// ── Ραδιόφωνο ──────────────────────────────────────────────────────────
// radio/config.json: πρόγραμμα, ποιότητα, διατήρηση (το διαβάζει το workflow σε κάθε εκτέλεση· βλ. radio/schedule.js)
// radio/control.json: έναρξη/διακοπή· το commit του ξεκινά το workflow (push), που το ελέγχει και ενώ γράφει.
// radio-log/log.json: ημερολόγιο εκτελέσεων που γράφει το workflow.
const schedule = require('../radio/schedule.js');
const program = require('../radio/program.js');
const cleanupPlan = schedule.cleanupPlan;

async function readJson(path, fallback) {
  const f = await gh('/contents/' + path + '?ref=' + BRANCH, { allow404: true });
  if (!f) return fallback;
  try { return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8')); } catch { return fallback; }
}
async function del(path) {
  const r = await fetch(API + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, 'User-Agent': 'orthodox-notebook-admin', Accept: 'application/vnd.github+json' } });
  if (!r.ok && r.status !== 404) throw new Error('GitHub ' + r.status);
}
async function readLog() {
  const rel = await gh('/releases/tags/radio-log', { allow404: true });
  const asset = rel && rel.assets.find(a => a.name === 'log.json');
  if (!asset) return [];
  const r = await fetch(API + '/releases/assets/' + asset.id, { headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/octet-stream', 'User-Agent': 'orthodox-notebook-admin' } });
  try { return r.ok ? (await r.json()).slice(0, 100) : []; } catch { return []; }
}
const summary = n => ({ id: n.id, tag: n.tag, date: n.date, growing: n.growing, status: n.status, segments: n.segments.length, size: n.size, dur: n.dur,
  kbps: [...new Set(n.segments.map(s => s.kbps))], first: n.segments[0] && n.segments[0].start, titles: [...new Set(n.shows.map(s => s.title))].slice(0, 12),
  shows: n.shows.map(s => ({ start: s.start, title: s.title })), cover: cover(n.segments) });
// Τα διαστήματα με ήχο μιας ημέρας (για το «ηχογραφήθηκε» στο πρόγραμμα του σταθμού)
function cover(segs) {
  const out = [];
  for (const s of segs) {
    if (!s.start) continue;
    const e = s.start + s.dur * 1000, last = out[out.length - 1];
    if (last && s.start <= last[1] + 60e3) last[1] = Math.max(last[1], e); else out.push([s.start, e]);
  }
  return out;
}

async function radio(b) {
  if (b.action === 'radio-get') {
    const [config, control, nights, log] = await Promise.all([
      readJson('radio/config.json', {}), readJson('radio/control.json', {}), recordings.nights(), readLog(),
    ]);
    const cfg = schedule.normalize(config), now = Date.now();
    const upcoming = schedule.windows(cfg, now - 6 * 3600e3, now + 8 * 86400e3).filter(w => w.end > now).slice(0, 8);
    const recs = nights.map(n => ({ id: n.id, tag: n.tag, date: n.date, bytes: n.size }));
    return {
      now, config: cfg, control, log, upcoming, estimate: schedule.estimate(cfg, now),
      nights: nights.map(summary),
      storage: { bytes: nights.reduce((a, n) => a + n.size, 0), seconds: nights.reduce((a, n) => a + n.dur, 0), count: nights.length },
      wouldDelete: cleanupPlan(recs, cfg, now).map(r => ({ tag: r.tag, bytes: r.bytes })),
    };
  }
  if (b.action === 'radio-night') {
    if (!/^rec-\d{4}-\d{2}-\d{2}$/.test(b.tag || '')) throw new Error('Άγνωστη ηχογράφηση.');
    const n = await recordings.nightByTag(b.tag);
    if (!n) throw new Error('Δεν βρέθηκε η ηχογράφηση.');
    return { night: Object.assign(summary(n), { shows: n.shows, segments: n.segments.map(s => ({ id: s.id, name: s.name, start: s.start, dur: s.dur, size: s.size, kbps: s.kbps })) }) };
  }
  if (b.action === 'radio-config') {
    const errs = schedule.validate(b.config);
    if (errs.length) throw new Error(errs.join(' '));
    const cfg = schedule.normalize(b.config);
    await commit('Ραδιόφωνο: ρυθμίσεις (' + cfg.rules.filter(r => r.enabled).length + ' κανόνες, ' + cfg.quality.bitrate + 'k ' + (cfg.quality.channels === 2 ? 'stereo' : 'mono') + ')',
      { 'radio/config.json': JSON.stringify(cfg, null, 2) + '\n' }, []);
    return { config: cfg };
  }
  if (b.action === 'radio-start') {
    const now = Date.now();
    let until;
    if (b.until && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.until)) {
      const today = schedule.athensDate(now);
      until = schedule.at(today, b.until);
      if (until <= now + 60e3) until = schedule.at(schedule.addDays(today, 1), b.until);
    } else {
      const hours = Number(b.hours);
      if (!(hours >= 0.25 && hours <= 24)) throw new Error('Η διάρκεια πρέπει να είναι από 0,25 έως 24 ώρες.');
      until = now + hours * 3600e3;
    }
    const at = Math.floor(now / 1000);
    await commit('Ραδιόφωνο: έναρξη ηχογράφησης', { 'radio/control.json': JSON.stringify({ cmd: 'start', at, until: Math.floor(until / 1000) }, null, 2) + '\n' }, []);
    return { until };
  }
  if (b.action === 'radio-stop') {
    await commit('Ραδιόφωνο: διακοπή ηχογράφησης', { 'radio/control.json': JSON.stringify({ cmd: 'stop', at: Math.floor(Date.now() / 1000) }, null, 2) + '\n' }, []);
    return {};
  }
  if (b.action === 'radio-delete') {
    if (!/^rec-\d{4}-\d{2}-\d{2}$/.test(b.tag || '') || !/^\d+$/.test(String(b.id || ''))) throw new Error('Άγνωστη ηχογράφηση.');
    const rel = await gh('/releases/' + b.id, { allow404: true });
    if (!rel || rel.tag_name !== b.tag) throw new Error('Δεν βρέθηκε η ηχογράφηση.');
    const ids = Array.isArray(b.assets) ? b.assets.map(String) : null;
    if (ids) {
      // μόνο επιλεγμένα κομμάτια· αν δεν μείνει κανένα, σβήνεται και η ημέρα
      const own = new Set(rel.assets.map(a => String(a.id)));
      if (!ids.length || ids.some(id => !own.has(id) || !/^\d+$/.test(id))) throw new Error('Άγνωστα κομμάτια.');
      for (const id of ids) await del('/releases/assets/' + id);
      if (rel.assets.filter(a => /\.mp3$/.test(a.name)).every(a => ids.includes(String(a.id)))) { await del('/releases/' + b.id); await del('/git/refs/tags/' + b.tag); }
      return { deleted: ids.length };
    }
    await del('/releases/' + b.id);
    await del('/git/refs/tags/' + b.tag);
    return {};
  }
  if (b.action === 'radio-station') {
    return { week: await program.fetchWeek(), days: program.DAYS, src: program.SRC };
  }
  return null;
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
      const title = sanitizeName(b.title);
      if (!title) return send(res, 400, { ok: false, error: 'Ο τίτλος είναι υποχρεωτικός.' });
      let folder, deletes = [];
      if (b.action === 'create') {
        // νέος φάκελος· αν υπάρχει ήδη ίδιο όνομα, «… 2», «… 3»
        const base = folderName(title);
        folder = base;
        for (let n = 2; (await listFolder(folder)).length; n++) {
          if (n > 20) return send(res, 409, { ok: false, error: 'Υπάρχουν ήδη πολλές ομιλίες με αυτόν τον τίτλο.' });
          folder = base + ' ' + n;
        }
      } else {
        // η επεξεργασία κρατά τον ίδιο φάκελο (και τον ίδιο σύνδεσμο), ακόμη κι αν αλλάξει ο τίτλος
        if (!validId(b.id)) return send(res, 400, { ok: false, error: 'Άγνωστη ομιλία.' });
        folder = b.id;
        deletes = await listFolder(folder);
        if (!deletes.length) return send(res, 404, { ok: false, error: 'Δεν βρέθηκε η ομιλία.' });
      }
      const sha = await commit((b.action === 'create' ? 'Νέα ομιλία: ' : 'Διόρθωση ομιλίας: ') + title, filesFor(folder, b), deletes);
      return send(res, 200, { ok: true, id: folder, commit: sha });
    }

    if (b.action === 'delete') {
      if (!validId(b.id)) return send(res, 400, { ok: false, error: 'Άγνωστη ομιλία.' });
      const old = await listFolder(b.id);
      if (!old.length) return send(res, 404, { ok: false, error: 'Δεν βρέθηκε η ομιλία.' });
      const sha = await commit('Διαγραφή ομιλίας: ' + b.id, {}, old);
      return send(res, 200, { ok: true, commit: sha });
    }

    if (String(b.action || '').startsWith('radio-')) {
      const out = await radio(b);
      if (out) return send(res, 200, Object.assign({ ok: true }, out));
    }

    return send(res, 400, { ok: false, error: 'Άγνωστη ενέργεια.' });
  } catch (e) {
    return send(res, 502, { ok: false, error: 'Η αποθήκευση απέτυχε: ' + e.message });
  }
}

module.exports = handler;
module.exports.sanitizeName = sanitizeName;
module.exports.folderName = folderName;

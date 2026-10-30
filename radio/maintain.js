// radio/maintain.js — αυτόματη διαγραφή παλιών ηχογραφήσεων (από το workflow)
//
//   node radio/maintain.js cleanup <config.json>
// Σβήνει ημέρες παλαιότερες από retentionDays και, αν ο χώρος ξεπερνά το maxGB, τις παλαιότερες μέχρι να χωρέσει.
// Δεν αγγίζει ποτέ τη σημερινή και τη χθεσινή ημέρα (μπορεί να γράφονται ακόμη).
// Τυπώνει JSON: { deleted: [{ tag, bytes }], totalBytes, count }
// env: GITHUB_TOKEN ή GH_TOKEN, GITHUB_REPOSITORY

'use strict';

const S = require('./schedule.js');

async function gh(path, opts = {}) {
  const r = await fetch('https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + path, {
    method: opts.method || 'GET',
    headers: { Authorization: 'Bearer ' + (process.env.GITHUB_TOKEN || process.env.GH_TOKEN), Accept: 'application/vnd.github+json', 'User-Agent': 'peiraiki-recorder' },
  });
  if (!r.ok && !(opts.allow404 && r.status === 404)) throw new Error('GitHub ' + r.status + ' ' + path);
  return r.status === 204 || r.status === 404 ? null : r.json();
}

async function allRecordings() {
  const out = [];
  for (let page = 1; page <= 30; page++) {
    const list = await gh('/releases?per_page=100&page=' + page);
    out.push(...list.filter(r => /^rec-\d{4}-\d{2}-\d{2}$/.test(r.tag_name)));
    if (list.length < 100) break;
  }
  return out.map(r => ({ id: r.id, tag: r.tag_name, date: r.tag_name.slice(4), bytes: r.assets.reduce((a, x) => a + x.size, 0) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const plan = S.cleanupPlan;

async function cleanup(config) {
  const recs = await allRecordings();
  const gone = plan(recs, config);
  for (const r of gone) {
    await gh('/releases/' + r.id, { method: 'DELETE', allow404: true });
    await gh('/git/refs/tags/' + r.tag, { method: 'DELETE', allow404: true });
  }
  const left = recs.filter(r => !gone.includes(r));
  return { deleted: gone.map(r => ({ tag: r.tag, bytes: r.bytes })), totalBytes: left.reduce((a, r) => a + r.bytes, 0), count: left.length };
}

module.exports = { plan };

if (require.main === module && process.argv[2] === 'cleanup') {
  let cfg = {};
  try { cfg = JSON.parse(require('fs').readFileSync(process.argv[3], 'utf8')); } catch { /* προεπιλογές */ }
  cleanup(cfg).then(r => console.log(JSON.stringify(r)), e => { console.error(e.message); process.exit(1); });
}

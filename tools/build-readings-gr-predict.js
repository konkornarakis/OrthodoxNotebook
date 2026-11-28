// tools/build-readings-gr-predict.js — τα αναγνώσματα κατά την τάξη της Εκκλησίας της Ελλάδος για τις ημέρες
// που δεν έχουν δημοσιευτεί ακόμη
//
//   node tools/build-readings-gr-predict.js [από έτος] [έως έτος]   → readings-gr-pred/<έτος>.json και readings-gr-pred/b/*.json
//                                                                   (προεπιλογή 2025–2035)
//   node tools/build-readings-gr-predict.js --check                 → πόσο σωστά προβλέπεται κάθε έτος του αρχείου
//
// Το saint.gr δημοσιεύει τα αναγνώσματα του Ημερολογίου της Εκκλησίας της Ελλάδος μόνο ~15 ημέρες μπροστά.
// Για τις υπόλοιπες ημέρες, η τάξη «μαθαίνεται» από το αρχείο του saint.gr (2011 κ.ε., saint-gr-history.json):
// κάθε ανάγνωσμα μιας ημέρας ορίζεται είτε από την ημερομηνία (Μηναίο), είτε από τη θέση ως προς το Πάσχα
// (Τριώδιο, Πεντηκοστάριο), είτε από τη συνεχή σειρά των εβδομάδων (με το «άλμα» του Λουκά κ.λπ.).
// Για κάθε τέτοια ένδειξη κρατάμε τι διαβάστηκε στα έτη του αρχείου, και σε κάθε ημέρα οι ενδείξεις της ψηφίζουν.
// Ένδειξη είναι και ο υπολογισμός του lectionary.js, ώστε να καλύπτονται συνδυασμοί που δεν έτυχαν στο αρχείο.
// Το κείμενο κάθε περικοπής είναι αυτό που έδειξε το saint.gr σε κάποιο προηγούμενο έτος.
//
// Μορφή: readings-gr-pred/<έτος>.json = { 'ΜΜ-ΗΗ': { r: [[k, αριθμός ενότητας, παραπομπή]], s?: 1, h? } }
//        (k: 'A' Απόστολος, 'E' Ευαγγέλιο, 'H' Εωθινό· s: 1 = ημέρα του αρχείου, όπως τη δημοσίευσε το saint.gr, με την επικεφαλίδα h·
//        χωρίς s = πρόβλεψη)
//        readings-gr-pred/b/<αριθμός % 16>.json = { αριθμός: { b, ref, i, n?, v } }

'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./readings/lectionary.js');

const HIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'readings', 'saint-gr-history.json'), 'utf8'));
// και όσα έχει κατεβάσει στο μεταξύ το καθημερινό build-readings-gr.js (readings-gr/<έτος>.json)
{
  const index = new Map(HIST.blocks.map((b, i) => [JSON.stringify(b), i]));
  const GR = path.join(__dirname, '..', 'readings-gr');
  for (const f of fs.existsSync(GR) ? fs.readdirSync(GR).filter(f => /^\d{4}\.json$/.test(f)) : []) {
    const year = JSON.parse(fs.readFileSync(path.join(GR, f), 'utf8'));
    for (const [md, day] of Object.entries(year)) {
      const date = f.slice(0, 4) + '-' + md;
      if (HIST.days[date]) continue;
      HIST.days[date] = { h: day.h, r: day.r.map(({ k, t, ...b }) => {
        const key = JSON.stringify(b);
        if (!index.has(key)) { index.set(key, HIST.blocks.length); HIST.blocks.push(b); }
        return [k, index.get(key)];
      }) };
    }
  }
}
const OUT = path.join(__dirname, '..', 'readings-gr-pred');
const KINDS = ['A', 'E', 'H'];

// Σύγκριση περικοπών με το βιβλίο και τον πρώτο στίχο (οι εκδόσεις διαφέρουν συχνά κατά έναν στίχο στο τέλος)
const AB = { Matt: 'Ματθ', Mark: 'Μάρκ', Luke: 'Λουκ', John: 'Ιω', Acts: 'Πράξ', Rom: 'Ρωμ', '1Cor': 'ΑΚορ', '2Cor': 'ΒΚορ', Gal: 'Γαλ', Eph: 'Εφ',
  Phil: 'Φιλιπ', Col: 'Κολ', '1Thess': 'ΑΘεσ', '2Thess': 'ΒΘεσ', '1Tim': 'ΑΤιμ', '2Tim': 'ΒΤιμ', Titus: 'Τίτ', Heb: 'Εβρ', James: 'Ιακ',
  '1Peter': 'ΑΠέτρ', '2Peter': 'ΒΠέτρ', '1John': 'ΑΙω', '2John': 'ΒΙω', '3John': 'ΓΙω', Jude: 'Ιούδ' };
const startOf = ref => { const m = /^([^\d]+?)\s*(\d+),\s*(\d+)/.exec(ref); return m ? m[1].replace(/[\s.΄´']/g, '') + ' ' + m[2] + ',' + m[3] : '?' + ref; };
const startOfSpec = spec => { const m = /^(\w+?)_(\d+)_/.exec(spec); const a = +m[2]; return AB[m[1]] + ' ' + Math.floor(a / 1000) + ',' + (a % 1000); };
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const [x, u] = a.split(' '), [y, w] = b.split(' ');
  if (x !== y || !u || !w) return false;
  const [c1, v1] = u.split(',').map(Number), [c2, v2] = w.split(',').map(Number);
  return c1 === c2 && Math.abs(v1 - v2) <= 1;
};

// ── Οι ενδείξεις μιας ημέρας ────────────────────────────────────────────────
function cues(y, m, d) {
  const c = L.dayInfo(y, m, d, { cycleOnly: true });
  const alg = L.dayInfo(y, m, d).readings;
  const wd = c.weekday, md = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  const cls = wd === 0 ? 'S' : wd === 6 ? 's' : 'w';
  const per = c.pdist >= -48 && c.pdist <= -1 ? 'L' : c.pdist >= 0 && c.pdist <= 56 ? 'P' : 'O';
  const j = L.dayNum(y, m, d), P = L.pascha;
  const prevP = j >= P(y) ? P(y) : P(y - 1), nextP = j < P(y) ? P(y) : P(y + 1);
  const ey = m > 9 || (m === 9 && d > 14) ? y : y - 1, el = L.dayNum(ey, 9, 14);
  const sunAfterElevation = el + 7 - (((el - P(ey)) % 7) + 7) % 7;
  // ο Άγιος Γεώργιος, όταν η 23η Απριλίου πέφτει έως το Πάσχα, εορτάζεται τη Δευτέρα της Διακαινησίμου
  const georgeMoved = L.dayNum(y, 4, 23) <= P(y) && j === P(y) + 1;
  const out = {};
  for (const k of KINDS) {
    const ar = k === 'H' ? null : alg.find(r => (r.source === 'Epistle') === (k === 'A'));
    const av = k === 'H' ? '' : ar ? startOfSpec(L.PERICOPES[ar.pericope][2]) : '-';
    const ci = k === 'A' ? c.epistle : c.gospel;
    out[k] = [
      'U:' + av + ':' + cls + per, 'U:' + av + ':' + cls, 'U:' + av,
      'M:' + c.pdist, 'F:' + md + ':' + cls + per, 'F:' + md + ':' + cls, 'F:' + md,
      'C:' + ci + ':' + cls, 'C:' + ci, 'P:' + (j - prevP), 'N:' + (j - nextP), 'X:' + (j - sunAfterElevation),
    ].concat(georgeMoved ? ['G:moved'] : []);
  }
  return out;
}

// ── Παρατηρήσεις από το αρχείο ──────────────────────────────────────────────
function observations() {
  const obs = [];
  for (const [date, day] of Object.entries(HIST.days)) {
    const [y, m, d] = date.split('-').map(Number);
    const cs = cues(y, m, d);
    for (const k of KINDS) {
      const hit = day.r.find(x => x[0] === k);
      const block = hit ? hit[1] : -1;
      obs.push({ y, date, k, block, val: hit ? startOf(HIST.blocks[block].ref) : '-', keys: cs[k] });
    }
  }
  return obs;
}

// ── Μάθηση και πρόβλεψη ─────────────────────────────────────────────────────
function train(obs) {
  const T = new Map();
  for (const o of obs) for (const key of o.keys) {
    const kk = o.k + '|' + key;
    if (!T.has(kk)) T.set(kk, new Map());
    const vals = T.get(kk);
    const e = vals.get(o.val) || { n: 0, ys: new Map(), blocks: new Map() };
    e.n++;
    e.ys.set(o.y, (e.ys.get(o.y) || 0) + 1);
    e.blocks.set(o.block, Math.max(e.blocks.get(o.block) || 0, o.y));
    vals.set(o.val, e);
  }
  return T;
}
// Πρόβλεψη. Αν κάποια ένδειξη έδωσε πάντα την ίδια περικοπή (σε τουλάχιστον 4 ημέρες του αρχείου), αποφασίζει
// εκείνη — έτσι μια μεγάλη εορτή που πέφτει Κυριακή κρατά τα δικά της αναγνώσματα (π.χ. η Κοίμηση της Θεοτόκου).
// Αλλιώς ψηφοφορία: κάθε ένδειξη της ημέρας ψηφίζει με το ποσοστό που είχε κάθε περικοπή στα έτη του αρχείου
// (εξομαλυμένο, ώστε μια ένδειξη με λίγες παρατηρήσεις να βαραίνει λιγότερο). Στον έλεγχο με τα έτη του αρχείου
// αυτό αποδείχθηκε ακριβέστερο από την επιλογή της «πιο αξιόπιστης» ένδειξης ή από ζυγισμένες ψήφους.
function predict(T, k, keys) {
  const score = new Map(), blocks = new Map();
  let sure = null;
  for (const key of keys) {
    const vals = T.get(k + '|' + key);
    if (!vals) continue;
    let tot = 0;
    for (const e of vals.values()) tot += e.n;
    if (vals.size === 1 && tot >= 4 && (!sure || tot > sure[1]) && !(sure && sure[1] === Infinity)) sure = [vals.keys().next().value, tot];
    // η μετάθεση του Αγίου Γεωργίου είναι ρητή διάταξη: η επικρατέστερη περικοπή της
    if (key === 'G:moved') { const top = [...vals].sort((a, b) => b[1].n - a[1].n)[0]; sure = [top[0], Infinity]; }
    for (const [val, e] of vals) {
      score.set(val, (score.get(val) || 0) + e.n / (tot + 1));
      const bs = blocks.get(val) || new Map();
      for (const [b, y] of e.blocks) bs.set(b, Math.max(bs.get(b) || 0, y));
      blocks.set(val, bs);
    }
  }
  let best = sure;
  if (!best) for (const [val, sc] of score) if (!best || sc > best[1]) best = [val, sc];
  if (!best || best[0] === '-') return null;
  // το κείμενο: η ενότητα με αυτή την περικοπή που εμφανίστηκε πιο πρόσφατα
  return [...blocks.get(best[0]).entries()].filter(([b]) => b >= 0).sort((a, b) => b[1] - a[1])[0][0];
}

function check() {
  const obs = observations();
  const years = [...new Set(obs.map(o => o.y))];
  let ok = 0, tot = 0, okAlg = 0, okAE = 0;
  const rows = [];
  for (const y of years) {
    const T = train(obs.filter(o => o.y !== y));
    let a = 0, b = 0;
    for (const o of obs.filter(o => o.y === y)) {
      const p = predict(T, o.k, o.keys);
      const pv = p === null ? '-' : startOf(HIST.blocks[p].ref);
      tot++; b++;
      if (same(pv, o.val)) { ok++; a++; if (o.k !== 'H') okAE++; }
      if (o.k !== 'H' && same(o.keys[2].slice(2), o.val)) okAlg++;
    }
    rows.push(y + ': ' + (100 * a / b).toFixed(0) + '%');
  }
  const totAE = obs.filter(o => o.k !== 'H').length;
  console.log('Πρόβλεψη (κάθε έτος χωρίς να το έχει «δει»): ' + ok + '/' + tot + ' = ' + (100 * ok / tot).toFixed(1) + '%');
  console.log('Απόστολος και Ευαγγέλιο: ' + okAE + '/' + totAE + ' = ' + (100 * okAE / totAE).toFixed(1) + '%');
  console.log('Μόνο ο υπολογισμός lectionary.js (Απόστολος και Ευαγγέλιο): ' + okAlg + '/' + totAE + ' = ' + (100 * okAlg / totAE).toFixed(1) + '%');
  console.log(rows.join(' · '));
}

function build(from, to) {
  const obs = observations(), T = train(obs);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'b'), { recursive: true });
  const used = new Set();
  for (let y = from; y <= to; y++) {
    const year = {};
    for (let t = new Date(Date.UTC(y, 0, 1)); t.getUTCFullYear() === y; t.setUTCDate(t.getUTCDate() + 1)) {
      const m = t.getUTCMonth() + 1, d = t.getUTCDate(), md = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const known = HIST.days[y + '-' + md];
      if (known) {   // ημέρα του αρχείου: ό,τι δημοσίευσε το saint.gr
        for (const [, b] of known.r) used.add(b);
        year[md] = { s: 1, h: known.h, r: known.r.map(([k, b]) => [k, b, HIST.blocks[b].ref]) };
        continue;
      }
      const cs = cues(y, m, d), r = [];
      for (const k of KINDS) { const b = predict(T, k, cs[k]); if (b !== null) { r.push([k, b, HIST.blocks[b].ref]); used.add(b); } }
      year[md] = { r };
    }
    fs.writeFileSync(path.join(OUT, y + '.json'), JSON.stringify(year) + '\n');
  }
  const chunks = {};
  for (const b of [...used].sort((a, b) => a - b)) (chunks[b % 16] = chunks[b % 16] || {})[b] = HIST.blocks[b];
  for (const [n, c] of Object.entries(chunks)) fs.writeFileSync(path.join(OUT, 'b', n + '.json'), JSON.stringify(c) + '\n');
  console.log('readings-gr-pred: ' + from + '–' + to + ', ' + used.size + ' περικοπές');
}

const args = process.argv.slice(2);
if (args[0] === '--check') check();
else build(+(args[0] || 2025), +(args[1] || 2035));

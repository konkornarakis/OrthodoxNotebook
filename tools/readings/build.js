// tools/readings/build.js — κατασκευή των αρχείων readings/*.json
//
//   node tools/readings/build.js <φάκελος greektext-antoniades> <φάκελος byzantine-majority-text> [από έτος] [έως έτος]
//
// Κείμενο: η Πατριαρχική έκδοση της Καινής Διαθήκης (Αντωνιάδης, 1904/1912), στην ηλεκτρονική
// μορφή του M. A. Robinson (κοινό κτήμα, github.com/byztxt/greektext-antoniades). Εκείνη δεν έχει
// τόνους· οι τόνοι και τα πνεύματα μεταφέρονται λέξη προς λέξη από το τονισμένο Βυζαντινό κείμενο
// των Robinson–Pierpont (κοινό κτήμα, github.com/byztxt/byzantine-majority-text). Οι λέξεις
// μένουν πάντα της Πατριαρχικής έκδοσης.

'use strict';

const fs = require('fs');
const path = require('path');
const L = require('./lectionary.js');

const [ANT, BYZ, FROM = '2025', TO = '2035'] = process.argv.slice(2);
if (!ANT || !BYZ) { console.error('χρήση: node build.js <antoniades> <byzantine> [από] [έως]'); process.exit(1); }
const OUT = path.join(__dirname, '..', '..', 'readings');

const BOOKS = {
  Matt: ['MT', 'MAT', 'Ματθ.', 'Κατά Ματθαίον'], Mark: ['MR', 'MAR', 'Μάρκ.', 'Κατά Μάρκον'],
  Luke: ['LU', 'LUK', 'Λουκ.', 'Κατά Λουκάν'], John: ['JOH', 'JOH', 'Ιω.', 'Κατά Ιωάννην'],
  Acts: ['AC', 'ACT', 'Πράξ.', 'Πράξεις των Αποστόλων'], Rom: ['RO', 'ROM', 'Ρωμ.', 'Προς Ρωμαίους'],
  '1Cor': ['1CO', '1CO', 'Α΄ Κορ.', 'Προς Κορινθίους Α΄'], '2Cor': ['2CO', '2CO', 'Β΄ Κορ.', 'Προς Κορινθίους Β΄'],
  Gal: ['GA', 'GAL', 'Γαλ.', 'Προς Γαλάτας'], Eph: ['EPH', 'EPH', 'Εφ.', 'Προς Εφεσίους'],
  Phil: ['PHP', 'PHP', 'Φιλιπ.', 'Προς Φιλιππησίους'], Col: ['COL', 'COL', 'Κολ.', 'Προς Κολοσσαείς'],
  '1Thess': ['1TH', '1TH', 'Α΄ Θεσ.', 'Προς Θεσσαλονικείς Α΄'], '2Thess': ['2TH', '2TH', 'Β΄ Θεσ.', 'Προς Θεσσαλονικείς Β΄'],
  '1Tim': ['1TI', '1TI', 'Α΄ Τιμ.', 'Προς Τιμόθεον Α΄'], '2Tim': ['2TI', '2TI', 'Β΄ Τιμ.', 'Προς Τιμόθεον Β΄'],
  Titus: ['TIT', 'TIT', 'Τίτ.', 'Προς Τίτον'], Heb: ['HEB', 'HEB', 'Εβρ.', 'Προς Εβραίους'],
  James: ['JAS', 'JAM', 'Ιακ.', 'Ιακώβου'], '1Peter': ['1PE', '1PE', 'Α΄ Πέτρ.', 'Πέτρου Α΄'],
  '2Peter': ['2PE', '2PE', 'Β΄ Πέτρ.', 'Πέτρου Β΄'], '1John': ['1JO', '1JO', 'Α΄ Ιω.', 'Ιωάννου Α΄'],
  '2John': ['2JO', '2JO', 'Β΄ Ιω.', 'Ιωάννου Β΄'], '3John': ['3JO', '3JO', 'Γ΄ Ιω.', 'Ιωάννου Γ΄'],
  Jude: ['JUDE', 'JUD', 'Ιούδ.', 'Ιούδα'],
};

// ── Κανονικοποίηση για σύγκριση λέξεων ─────────────────────────────────────
const strip = w => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/[^α-ω]/g, '');
const PUNCT = /^([^\p{L}]*)(.*?)([^\p{L}’᾽']*)$/u;

// ── Τονισμένο Βυζαντινό κείμενο ───────────────────────────────────────────
function parseCsv(file) {
  const out = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(1)) {
    const m = /^(\d+),(\d+),(?:"(.*)"|(.*))$/.exec(line);
    if (m) out.set(m[1] + ':' + m[2], m[3] !== undefined ? m[3].replace(/""/g, '"') : m[4]);
  }
  return out;
}
const byzWords = t => t.replace(/\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean).map(w => {
  const m = PUNCT.exec(w);
  return m[2] ? { core: m[2].replace(/[᾽']/g, '’'), n: strip(m[2]) } : null;
}).filter(Boolean);

const BYZTEXT = {}, DICT = new Map();
for (const [k, b] of Object.entries(BOOKS)) {
  BYZTEXT[k] = parseCsv(path.join(BYZ, 'csv-unicode/ccat/no-variants', b[1] + '.csv'));
  for (const t of BYZTEXT[k].values()) for (const w of byzWords(t)) {
    if (!DICT.has(w.n)) DICT.set(w.n, new Map());
    const c = DICT.get(w.n); c.set(w.core, (c.get(w.core) || 0) + 1);
  }
}
// λέξεις που η Πατριαρχική έκδοση γράφει αλλιώς από το Βυζαντινό κείμενο
const MANUAL = {
  διατι: 'διατί', ινατι: 'ἱνατί', κραβαττον: 'κράβαττον', κραβαττου: 'κραβάττου', κραβαττοισ: 'κραβάττοις',
  μωυσει: 'Μωϋσεῖ', μωυσησ: 'Μωϋσῆς', μωυσεωσ: 'Μωϋσέως', μωυσην: 'Μωϋσῆν', αποκτεννουσα: 'ἀποκτέννουσα',
  αποκτεννοντων: 'ἀποκτεννόντων', αποκτεννοντεσ: 'ἀποκτέννοντες', ανωγαιον: 'ἀνώγαιον', βαλλαντιον: 'βαλλάντιον',
  βαλλαντια: 'βαλλάντια', βαλλαντιου: 'βαλλαντίου', υπερλιαν: 'ὑπερλίαν', υπερεκπερισσου: 'ὑπερεκπερισσοῦ',
  αραγε: 'ἄραγε', εγειρετε: 'ἐγείρετε', φησιν: 'φησίν', φημι: 'φημί',
};
const fromDict = n => {
  if (MANUAL[n]) return MANUAL[n]; const c = DICT.get(n); return c ? [...c.entries()].sort((a, b) => b[1] - a[1])[0][0] : null; };

// ── Πατριαρχική έκδοση ────────────────────────────────────────────────────
const ANTTEXT = {}, ORDER = {};
for (const [k, b] of Object.entries(BOOKS)) {
  ANTTEXT[k] = new Map(); ORDER[k] = [];
  for (const line of fs.readFileSync(path.join(ANT, 'textonly/unicode', b[0] + '.txt'), 'utf8').split(/\r?\n/)) {
    const m = /^(\d+):(\d+)\s+(.*)$/.exec(line.trim());
    if (m) { const key = m[1] + ':' + m[2]; ANTTEXT[k].set(key, m[3]); ORDER[k].push(key); }
  }
}

let unknownWords = 0, totalWords = 0;
function accentVerse(book, key) {
  const ant = ANTTEXT[book].get(key);
  if (ant === undefined) return null;
  const toks = ant.split(/\s+/).filter(Boolean).map(w => { const m = PUNCT.exec(w); return { pre: m[1], core: m[2], post: m[3].replace(/[’᾽']/g, ''), n: strip(m[2]) }; });
  const byz = BYZTEXT[book].has(key) ? byzWords(BYZTEXT[book].get(key)) : [];
  // μακρύτερη κοινή υπακολουθία
  const A = toks.length, B = byz.length, T = Array.from({ length: A + 1 }, () => new Int16Array(B + 1));
  for (let i = A - 1; i >= 0; i--) for (let j = B - 1; j >= 0; j--)
    T[i][j] = toks[i].n === byz[j].n ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  for (let i = 0, j = 0; i < A;) {
    if (j < B && toks[i].n === byz[j].n) { toks[i].acc = byz[j].core; i++; j++; }
    else if (j < B && T[i][j + 1] >= T[i + 1][j]) j++;
    else i++;
  }
  for (const t of toks) {
    if (!t.core) continue;
    totalWords++;
    if (!t.acc) t.acc = fromDict(t.n);
    if (!t.acc) { unknownWords++; t.acc = t.core; }
  }
  return toks;
}

// Κεφαλαία κατά τη συνήθεια των εκκλησιαστικών εκδόσεων
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
function capitalize(toks) {
  const words = toks.filter(t => t.core);
  words.forEach((t, i) => {
    const n = t.n, next = words[i + 1] ? words[i + 1].n : '', next2 = words[i + 2] ? words[i + 2].n : '', prev = words[i - 1] ? words[i - 1].n : '';
    if (/^θε(οσ|ου|ω|ον|ε)$/.test(n)) t.acc = cap(t.acc);
    else if (/^χριστ(οσ|ου|ω|ον|ε)$/.test(n)) t.acc = cap(t.acc);
    else if (/^κυρι(οσ|ου|ω|ον|ε)$/.test(n) && !/^(αυτου|αυτων|του|τησ|των|εκεινου)$/.test(next)) t.acc = cap(t.acc);
    else if (/^πνευμ(α|ατοσ|ατι)$/.test(n) && ([prev, next, next2, words[i - 2] ? words[i - 2].n : ''].some(x => /^αγι/.test(x)) ||
      (next === 'του' && /^(θεου|υιου|χριστου)$/.test(next2)) || /^(κυριου|θεου|χριστου)$/.test(next) || (next === 'τησ' && next2 === 'αληθειασ'))) t.acc = cap(t.acc);
    else if (/^υι(οσ|ου|ω|ον|ε)$/.test(n) && ((next === 'του' && /^(θεου|ανθρωπου|υψιστου)$/.test(next2)) || next === 'θεου')) t.acc = cap(t.acc);
    else if (t.logos && /^λογ(οσ|ου|ω|ον)$/.test(n)) t.acc = cap(t.acc);
  });
}

function versesOf(spec) {
  // π.χ. "Matt_4023_5013|Matt_5017_5019"
  const out = [];
  // διαφορές αρίθμησης: η δοξολογία του Ρωμ. 16, 25-27 βρίσκεται στο 14, 24-26 της Πατριαρχικής έκδοσης·
  // και μια περικοπή των δεδομένων γράφει 2 Κορ. 3, 12-21 αντί 3, 12-18
  spec = spec.replace('Rom_16025_16027', 'Rom_14024_14026').replace('2Cor_3012_3021', '2Cor_3012_3018');
  for (const seg of spec.split('|')) {
    const m = /^(\w+?)_(\d+)_(\d+)$/.exec(seg);
    const book = m[1], a = +m[2], b = +m[3];
    const k0 = Math.floor(a / 1000) + ':' + (a % 1000), k1 = Math.floor(b / 1000) + ':' + (b % 1000);
    const ord = ORDER[book];
    let i0 = ord.indexOf(k0), i1 = ord.indexOf(k1);
    if (i0 < 0 || i1 < 0) { console.warn('λείπει στίχος', seg); if (i0 < 0) continue; if (i1 < 0) i1 = i0; }
    for (let i = i0; i <= i1; i++) out.push([book, ord[i]]);
  }
  return out;
}

function refLabel(spec) {
  // «Ματθ. 4, 23 – 5, 13· 5, 17-19»
  let last = null;
  return spec.split('|').map(seg => {
    const m = /^(\w+?)_(\d+)_(\d+)$/.exec(seg);
    const book = m[1], a = +m[2], b = +m[3], ca = Math.floor(a / 1000), va = a % 1000, cb = Math.floor(b / 1000), vb = b % 1000;
    const range = ca === cb ? `${ca}, ${va}${vb !== va ? '-' + vb : ''}` : `${ca}, ${va} – ${cb}, ${vb}`;
    const s = (book !== last ? BOOKS[book][2] + ' ' : '') + range;
    last = book;
    return s;
  }).join('· ');
}

// Η αρχή με την οποία διαβάζεται η περικοπή στον ναό
function incipit(en) {
  const p = (en || '').trim();
  if (/^The Lord said this parable/.test(p)) return 'Εἶπεν ὁ Κύριος τὴν παραβολὴν ταύτην·';
  if (/^The Lord said to [Hh]is disciples/.test(p)) return 'Εἶπεν ὁ Κύριος τοῖς ἑαυτοῦ μαθηταῖς·';
  if (/^The Lord said to the Jews that came to Him/.test(p)) return 'Εἶπεν ὁ Κύριος πρὸς τοὺς ἐληλυθότας πρὸς αὐτὸν Ἰουδαίους·';
  if (/^The Lord said[:,]?$/.test(p)) return 'Εἶπεν ὁ Κύριος·';
  if (/^Brethren,/.test(p)) return 'Ἀδελφοί,';
  if (/^At that time,?/.test(p)) return 'Τῷ καιρῷ ἐκείνῳ,';
  if (/^In those days,?/.test(p)) return 'Ἐν ταῖς ἡμέραις ἐκείναις,';
  if (/^My son Timothy,/.test(p)) return 'Τέκνον Τιμόθεε,';
  if (/^My beloved,/.test(p)) return 'Ἀγαπητοί,';
  return '';
}

// ── Κατασκευή ─────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const used = new Set();
for (let y = +FROM; y <= +TO; y++) {
  const days = {};
  for (let n = L.dayNum(y, 1, 1); n < L.dayNum(y + 1, 1, 1); n++) {
    const { m, d } = L.fromDayNum(n);
    const info = L.dayInfo(y, m, d);
    if (!info.readings.length) continue;
    days[String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')] = info.readings.map(r => { used.add(r.pericope); return [r.pericope, r.source === 'Epistle' ? 'A' : 'E']; });
  }
  fs.writeFileSync(path.join(OUT, y + '.json'), JSON.stringify(days));
}

const texts = {};
for (const pid of [...used].sort((a, b) => a - b)) {
  const spec = L.PERICOPES[pid][2].replace('2Cor_3012_3021', '2Cor_3012_3018');
  const vs = versesOf(spec);
  const verses = [];
  let all = [];
  for (const [book, key] of vs) {
    const toks = accentVerse(book, key);
    if (!toks) continue;
    if (book === 'John' && /^1:([1-9]|1[0-4])$/.test(key)) toks.forEach(t => { t.logos = true; });
    verses.push({ key, toks });
    all = all.concat(toks);
  }
  capitalize(all);
  if (verses.length && verses[0].toks.length) { const t = verses[0].toks.find(x => x.core); if (t) t.acc = cap(t.acc); }
  const book = /^(\w+?)_/.exec(spec)[1];
  texts[pid] = {
    r: refLabel(L.PERICOPES[pid][2]), b: BOOKS[book][3], i: incipit(L.PERICOPES[pid][4]),
    v: verses.map(({ key, toks }) => [key.replace(':', ','), toks.map(t => t.pre + (t.core ? t.acc : '') + t.post).join(' ').replace(/\s+/g, ' ').trim()]),
  };
}
// τα κείμενα σε 16 μικρά αρχεία (περικοπή % 16), ώστε η σελίδα να κατεβάζει μόνο ό,τι χρειάζεται
const CHUNKS = 16;
fs.mkdirSync(path.join(OUT, 't'), { recursive: true });
for (let c = 0; c < CHUNKS; c++) {
  const part = {};
  for (const [pid, t] of Object.entries(texts)) if (pid % CHUNKS === c) part[pid] = t;
  fs.writeFileSync(path.join(OUT, 't', c + '.json'), JSON.stringify(part));
}
try { fs.unlinkSync(path.join(OUT, 'texts.json')); } catch (e) { /* */ }
console.log('περικοπές', Object.keys(texts).length, '· λέξεις', totalWords, '· χωρίς τόνο', unknownWords);

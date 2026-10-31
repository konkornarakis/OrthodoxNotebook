// tools/build-readings-gr.js — τα αναγνώσματα κατά την τάξη της Εκκλησίας της Ελλάδος (saint.gr)
//
//   node tools/build-readings-gr.js            → readings-gr/<έτος>.json, όλες οι ημερομηνίες του έτους
//   node tools/build-readings-gr.js --window 16 → μόνο από 3 ημέρες πριν έως 16 μετά (καθημερινά)
//   node tools/build-readings-gr.js <σελίδα.html> …  → τυπώνει την ανάλυση σελίδων (για έλεγχο)
//
// Κάθε σελίδα ημερομηνίας του saint.gr (/ΜΜ/ΗΗ/index.aspx) έχει τα «Αναγνώσματα» της ημέρας του τρέχοντος
// (ή του επόμενου) έτους κατά το Ημερολόγιο της Εκκλησίας της Ελλάδος: την επικεφαλίδα της ημέρας και καρτέλες
// «Ἀπόστολος», «Εὐαγγέλιον», «Ἑωθινόν» κ.λπ. με το αρχαίο κείμενο. Τα δείχνει μόνο έως ~15 ημέρες μπροστά, γι' αυτό
// το workflow readings-gr.yml τρέχει κάθε μέρα (παράθυρο) και τα αρχεία κρατούν ό,τι έχει ήδη κατέβει.
// Οι ερμηνευτικές αποδόσεις που έχει το saint.gr (Τρεμπέλα, Κολιτσάρα) έχουν πνευματικά δικαιώματα και δεν
// αποθηκεύονται· η σελίδα των αναγνωσμάτων παραπέμπει σε αυτές.
//
// Μορφή: { "ΜΜ-ΗΗ": { "h": "επικεφαλίδα", "r": [{ "k": "A"|"E"|"H"|…, "t": "Ἀπόστολος", "b": "Προς Εβραίους",
//          "ref": "Εβρ. 4, 14-16· 5, 1-6", "i": "Ἀδελφοί,", "n": "Ἦχος βαρύς - Ἑωθινόν Ζ´"?, "v": [["4,14", "κείμενο"], …] }] } }

'use strict';

const fs = require('fs');
const path = require('path');
const { decodeHtml } = require('../api/saints.js');

const OUT = path.join(__dirname, '..', 'readings-gr');
const MONTHS = { 'Ιανουαρίου': 1, 'Φεβρουαρίου': 2, 'Μαρτίου': 3, 'Απριλίου': 4, 'Μαΐου': 5, 'Ιουνίου': 6, 'Ιουλίου': 7, 'Αυγούστου': 8, 'Σεπτεμβρίου': 9, 'Οκτωβρίου': 10, 'Νοεμβρίου': 11, 'Δεκεμβρίου': 12 };
const KIND = { 'Ἀπόστολος': 'A', 'Εὐαγγέλιον': 'E', 'Ἑωθινόν': 'H' };
// τίτλος βιβλίου (κεφαλαία στο saint.gr) → [πλήρες όνομα, συντομογραφία, εισαγωγή όπως διαβάζεται]
const BOOKS = [
  [/^ΚΑΤΑ ΜΑΤΘΑΙΟΝ/, 'Κατά Ματθαίον', 'Ματθ.', 'Τῷ καιρῷ ἐκείνῳ,'], [/^ΚΑΤΑ ΜΑΡΚΟΝ/, 'Κατά Μάρκον', 'Μάρκ.', 'Τῷ καιρῷ ἐκείνῳ,'],
  [/^ΚΑΤΑ ΛΟΥΚΑΝ/, 'Κατά Λουκάν', 'Λουκ.', 'Τῷ καιρῷ ἐκείνῳ,'], [/^ΚΑΤΑ ΙΩΑΝΝΗΝ/, 'Κατά Ιωάννην', 'Ιω.', 'Τῷ καιρῷ ἐκείνῳ,'],
  [/^ΠΡΑΞΕΙΣ/, 'Πράξεις των Αποστόλων', 'Πράξ.', 'Ἐν ταῖς ἡμέραις ἐκείναις,'],
  [/^ΠΡΟΣ ΡΩΜΑΙΟΥΣ/, 'Προς Ρωμαίους', 'Ρωμ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΚΟΡΙΝΘΙΟΥΣ Α/, 'Προς Κορινθίους Α΄', 'Α΄ Κορ.', 'Ἀδελφοί,'],
  [/^ΠΡΟΣ ΚΟΡΙΝΘΙΟΥΣ Β/, 'Προς Κορινθίους Β΄', 'Β΄ Κορ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΓΑΛΑΤΑΣ/, 'Προς Γαλάτας', 'Γαλ.', 'Ἀδελφοί,'],
  [/^ΠΡΟΣ ΕΦΕΣΙΟΥΣ/, 'Προς Εφεσίους', 'Εφ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΦΙΛΙΠΠΗΣΙΟΥΣ/, 'Προς Φιλιππησίους', 'Φιλιπ.', 'Ἀδελφοί,'],
  [/^ΠΡΟΣ ΚΟΛΟΣΣΑΕΙΣ/, 'Προς Κολοσσαείς', 'Κολ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΘΕΣΣΑΛΟΝΙΚΕΙΣ Α/, 'Προς Θεσσαλονικείς Α΄', 'Α΄ Θεσ.', 'Ἀδελφοί,'],
  [/^ΠΡΟΣ ΘΕΣΣΑΛΟΝΙΚΕΙΣ Β/, 'Προς Θεσσαλονικείς Β΄', 'Β΄ Θεσ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΤΙΜΟΘΕΟΝ Α/, 'Προς Τιμόθεον Α΄', 'Α΄ Τιμ.', 'Τέκνον Τιμόθεε,'],
  [/^ΠΡΟΣ ΤΙΜΟΘΕΟΝ Β/, 'Προς Τιμόθεον Β΄', 'Β΄ Τιμ.', 'Τέκνον Τιμόθεε,'], [/^ΠΡΟΣ ΤΙΤΟΝ/, 'Προς Τίτον', 'Τίτ.', 'Τέκνον Τίτε,'],
  [/^ΠΡΟΣ ΦΙΛΗΜΟΝΑ/, 'Προς Φιλήμονα', 'Φιλήμ.', 'Ἀδελφοί,'], [/^ΠΡΟΣ ΕΒΡΑΙΟΥΣ/, 'Προς Εβραίους', 'Εβρ.', 'Ἀδελφοί,'],
  [/^ΙΑΚΩΒΟΥ/, 'Ιακώβου', 'Ιακ.', 'Ἀδελφοί,'], [/^ΠΕΤΡΟΥ Α/, 'Πέτρου Α΄', 'Α΄ Πέτρ.', 'Ἀδελφοί,'], [/^ΠΕΤΡΟΥ Β/, 'Πέτρου Β΄', 'Β΄ Πέτρ.', 'Ἀδελφοί,'],
  [/^ΙΩΑΝΝΟΥ Α/, 'Ιωάννου Α΄', 'Α΄ Ιω.', 'Ἀγαπητοί,'], [/^ΙΩΑΝΝΟΥ Β/, 'Ιωάννου Β΄', 'Β΄ Ιω.', 'Ἀγαπητοί,'], [/^ΙΩΑΝΝΟΥ Γ/, 'Ιωάννου Γ΄', 'Γ΄ Ιω.', 'Ἀγαπητοί,'],
  [/^ΙΟΥΔΑ/, 'Ιούδα', 'Ιούδ.', 'Ἀγαπητοί,'],
];
const NUM = { Α: 1, Β: 2, Γ: 3, Δ: 4, Ε: 5, Ϛ: 6, Ζ: 7, Η: 8, Θ: 9, Ι: 10, Κ: 20, Λ: 30, Μ: 40, Ν: 50 };
function greekNum(s) {
  s = s.replace(/ΣΤ/g, 'Ϛ').replace(/[^ΑΒΓΔΕϚΖΗΘΙΚΛΜΝ]/g, '');
  return [...s].reduce((a, c) => a + (NUM[c] || 0), 0) || null;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ', rsquo: '’', lsquo: '‘' };
const text = h => h.replace(/<[^>]+>/g, ' ').replace(/&(#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(+e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();

// Μία ενότητα (αρχαίο κείμενο μιας καρτέλας): τίτλοι «ΒΙΒΛΙΟ ΚΕΦ´ στίχοι» και στίχοι <sup>Ν</sup>
function parseBlock(html) {
  const parts = html.split(/<div class="w3-center"><strong>([\s\S]*?)<\/strong><\/div>/);
  let book = null, verses = [], refs = [], note = '';
  for (let i = 1; i < parts.length; i += 2) {
    // ο τίτλος μπορεί να έχει πρώτα σημείωση σε άλλη γραμμή (π.χ. «Ἦχος βαρύς - Ἑωθινόν Ζ´<br />ΚΑΤΑ ΙΩΑΝΝΗΝ Κ´ 1 - 10»)
    const lines = parts[i].split(/<br\s*\/?>/i).map(text).filter(Boolean);
    const title = lines.pop() || '';
    if (lines.length && !note) note = lines.join(' ');
    const m = /^(.*?)\s+([Α-ΩϚ]+)[´΄']\s*(\d+)\s*(?:-\s*(?:([Α-ΩϚ]+)[´΄']\s*)?(\d+))?/.exec(title);
    if (!m) continue;
    const b = BOOKS.find(x => x[0].test(m[1]));
    if (!b) return null;   // όχι Καινή Διαθήκη (π.χ. προφητείες): δεν το υποστηρίζουμε εδώ
    if (book && book !== b) return null;
    book = b;
    let ch = greekNum(m[2]), last = 0;
    const startCh = ch, startV = +m[3];
    for (const v of parts[i + 1].split(/<sup><strong>(\d+)<\/strong><\/sup>/).slice(1).reduce((a, x, k, arr) => (k % 2 ? a : a.concat([[+x, arr[k + 1]]])), [])) {
      if (v[0] < last) ch++;   // η περικοπή περνά στο επόμενο κεφάλαιο
      last = v[0];
      const t = text(v[1]);
      if (t) verses.push([ch + ',' + v[0], t]);
    }
    refs.push(startCh === ch ? startCh + ', ' + startV + (last !== startV ? '-' + last : '') : startCh + ', ' + startV + ' – ' + ch + ', ' + last);
  }
  if (!book || !verses.length) return null;
  return Object.assign({ b: book[1], ref: book[2] + ' ' + refs.join('· '), i: book[3], v: verses }, note ? { n: note } : {});
}

function parsePage(html) {
  const i = html.indexOf('<h2 class="w3-border-bottom w3-border-gray myHeading">Αναγνώσματα');
  if (i < 0) return null;
  const sec = html.slice(i, html.indexOf('<h2', i + 10) > 0 ? html.indexOf('<h2', i + 10) : undefined);
  const dm = /(\d{1,2})\s+([Α-Ωα-ωάέήίόύώϊΐ]+)\s+(\d{4})/.exec(text(sec.slice(0, 600)));
  if (!dm || !MONTHS[dm[2]]) return null;
  const date = dm[3] + '-' + String(MONTHS[dm[2]]).padStart(2, '0') + '-' + String(+dm[1]).padStart(2, '0');
  const h = text((/<div class="w3-container w3-fourfifth">\s*<strong>([\s\S]*?)<\/strong>/.exec(sec) || [])[1] || '');
  const tabs = [...sec.matchAll(/displayTab\(event, 'gospel', 'tablink', '(gID\d+)'[^)]*\);">\s*<div[^>]*>([\s\S]*?)<\/div>/g)].map(m => ({ id: m[1], name: text(m[2]) }));
  const r = [];
  for (const tab of tabs) {
    const start = sec.indexOf('id="' + tab.id + 'vID3"');
    if (start < 0) continue;
    const end = sec.indexOf('id="' + tab.id + 'vID', start + 10);
    const block = parseBlock(sec.slice(start, end > 0 ? end : undefined));
    if (block) r.push(Object.assign({ k: KIND[tab.name] || tab.name, t: tab.name }, block));
  }
  return { date, h, r };
}

async function fetchPage(m, d) {
  const url = `https://www.saint.gr/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/index.aspx`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (OrthodoxNotebook)', 'Accept-Language': 'el' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return decodeHtml(await res.arrayBuffer(), res.headers.get('content-type'));
}

// Οι ημερομηνίες (ΜΜ, ΗΗ) που θα κατέβουν: όλο το έτος, ή ένα παράθυρο γύρω από σήμερα
function datesToFetch(windowDays) {
  const out = [];
  if (!windowDays) {
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= new Date(2024, m, 0).getDate(); d++) out.push([m, d]);
    return out;
  }
  const now = new Date(Date.now() + 2 * 3600e3);   // περίπου ώρα Ελλάδας
  for (let i = -3; i <= windowDays; i++) { const t = new Date(now.getTime() + i * 86400e3); out.push([t.getUTCMonth() + 1, t.getUTCDate()]); }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !args[0].startsWith('--')) {
    for (const f of args) console.log(JSON.stringify(parsePage(decodeHtml(fs.readFileSync(f), 'text/html; charset=utf-8')), null, 1));
    return;
  }
  // --window N: μόνο από 3 ημέρες πριν έως N μετά (το saint.gr δείχνει αναγνώσματα έως ~15 ημέρες μπροστά)
  const wi = args.indexOf('--window'), windowDays = wi >= 0 ? Number(args[wi + 1]) || 16 : 0;
  const list = datesToFetch(windowDays);
  const years = {}, sleep = ms => new Promise(r => setTimeout(r, ms));
  let ok = 0, empty = 0;
  const failed = [];
  for (const [m, d] of list) {
    let page, err;
    for (let a = 1; a <= 3 && page === undefined; a++) { try { page = parsePage(await fetchPage(m, d)); } catch (e) { err = e; await sleep(1500 * a); } }
    if (page === undefined) { failed.push(m + '/' + d + ' (' + (err && err.message) + ')'); continue; }
    if (!page) { empty++; continue; }   // χωρίς αναγνώσματα ακόμη (μακριά στο μέλλον)
    const [y, key] = [page.date.slice(0, 4), page.date.slice(5)];
    (years[y] = years[y] || {})[key] = { h: page.h, r: page.r };
    ok++;
    await sleep(300);
  }
  const need = windowDays ? Math.min(10, list.length - 5) : 250;
  if (ok < need) { console.error('Μόνο ' + ok + ' ημέρες με αναγνώσματα· δεν γράφεται τίποτα. Αποτυχίες: ' + failed.join(', ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [y, days] of Object.entries(years)) {
    const file = path.join(OUT, y + '.json');
    let old = {};
    try { old = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* νέο έτος */ }
    const merged = Object.assign(old, days);
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.entries(merged).sort())) + '\n');
    console.log(y + ': ' + Object.keys(days).length + ' ημέρες ενημερώθηκαν (σύνολο ' + Object.keys(merged).length + ')');
  }
  console.log('Χωρίς αναγνώσματα ακόμη: ' + empty + (failed.length ? ' · Αποτυχίες: ' + failed.join(', ') : ''));
}

module.exports = { parsePage };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

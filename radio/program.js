// radio/program.js — το πρόγραμμα της Πειραϊκής Εκκλησίας από τη σελίδα του σταθμού
//
// Η σελίδα (SRC) έχει καρτέλες ΔΕΥΤΕΡΑ…ΚΥΡΙΑΚΗ και έναν πίνακα ανά ημέρα: ώρα | τίτλος σε <strong> + περιγραφή.
// Το πρόγραμμα αλλάζει, γι' αυτό το workflow το διαβάζει σε κάθε ηχογράφηση και η διαχείριση όποτε ανοίγει.
//
//   node radio/program.js <σελίδα.html> <ΕΕΕΕ-ΜΜ-ΗΗ>
// τυπώνει σε μία γραμμή { src, fetched, days: { "<ημέρα>": [["ΩΩ:ΛΛ", "Τίτλος", "Περιγραφή"], …], "<επόμενη>": […] } }
// (μια βραδιά περνά τα μεσάνυχτα, γι' αυτό και η επόμενη ημέρα).

'use strict';

const SRC = 'https://www.peradio.com/evdomadiaio-programma/';
const DAYS = ['ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ', 'ΚΥΡΙΑΚΗ'];
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

function unescape(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) ? String.fromCodePoint(c) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function text(fragment) {
  let s = unescape(fragment.replace(/<[^>]+>/g, ' ')).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/\s+([.,;·…])/g, '$1');
}

function parseTable(table) {
  const rows = [];
  for (const tr of table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 2) continue;
    const m = /(\d{1,2})[:.](\d{2})/.exec(text(cells[0]));
    const body = cells[1];
    const strong = /<strong>([\s\S]*?)<\/strong>/i.exec(body);
    let title = strong ? text(strong[1]) : '';
    let desc = strong ? text(body.slice(0, strong.index) + ' ' + body.slice(strong.index + strong[0].length)) : text(body);
    if (!title) { title = desc; desc = ''; }
    title = title.replace(/’(?=[Α-ΩΆ-Ώ])/g, ' ').replace(/[ .]+$/, '');
    if (/Έναρξη\s+Νυχτερινού\s+Ραδιοφώνου/.test(title)) title = 'Νυχτερινό ραδιόφωνο';
    desc = desc.replace(/^[ .,;·]+/, '');
    if (!m) {   // γραμμή χωρίς ώρα: συνέχεια της προηγούμενης
      if (rows.length && (title || desc)) rows[rows.length - 1][2] = (rows[rows.length - 1][2] + ' ' + [title, desc].filter(Boolean).join(' ')).trim();
      continue;
    }
    if (title) rows.push([String(+m[1]).padStart(2, '0') + ':' + m[2], title, desc]);
  }
  return rows;
}

// Όλη η εβδομάδα: { ΔΕΥΤΕΡΑ: [...], … }
function parse(page) {
  const tabs = /uk-tab=[\s\S]*?<\/ul>/.exec(page);
  const labels = tabs ? [...tabs[0].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => text(m[1]).toUpperCase()) : [];
  const tables = page.slice(tabs ? tabs.index + tabs[0].length : 0).match(/<table\b[\s\S]*?<\/table>/gi) || [];
  if (labels.slice(0, 7).join() !== DAYS.join() || tables.length < 7) throw new Error('Άγνωστη μορφή σελίδας προγράμματος');
  const week = {};
  DAYS.forEach((d, i) => { week[d] = parseTable(tables[i]); });
  return week;
}

// Οι εκπομπές μιας ημέρας και της επόμενης
function forNight(week, date) {
  const [y, mo, d] = date.split('-').map(Number);
  const days = {};
  for (const n of [0, 1]) {
    const t = new Date(Date.UTC(y, mo - 1, d + n));
    const key = t.toISOString().slice(0, 10);
    days[key] = week[DAYS[(t.getUTCDay() + 6) % 7]];
  }
  if (!Object.values(days).some(r => r.length)) throw new Error('Κενό πρόγραμμα');
  return { src: SRC, fetched: Math.floor(Date.now() / 1000), days };
}

async function fetchWeek() {
  const r = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('peradio.com ' + r.status);
  return parse(await r.text());
}

module.exports = { SRC, DAYS, parse, forNight, fetchWeek };

if (require.main === module) {
  try {
    const page = require('fs').readFileSync(process.argv[2], 'utf8');
    process.stdout.write(JSON.stringify(forNight(parse(page), process.argv[3])) + '\n');
  } catch (e) { console.error(e.message); process.exit(1); }
}

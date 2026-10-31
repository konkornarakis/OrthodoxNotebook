// api/saints.js — οι άγιοι μιας ημέρας από τον Ορθόδοξο Συναξαριστή (saint.gr)
// GET /api/saints?m=10&d=9  →  { ok, date, source, saints: [{ name, url }] }
//
// Τρέχει ως serverless function στο Vercel και καλείται και από το dev-server.js.
// Η λήψη γίνεται από τον server, ώστε ο browser να μην χρειάζεται δημόσιους CORS proxies.

'use strict';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Ο saint.gr μπορεί να σερβίρει UTF-8 ή windows-1253· αποκωδικοποιούμε ανάλογα.
function decodeHtml(buf, contentType) {
  let charset = (/charset=([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!charset) {
    const head = Buffer.from(buf).subarray(0, 4096).toString('latin1');
    charset = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1];
  }
  try { return new TextDecoder((charset || 'utf-8').toLowerCase()).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}

// Το όνομα εμφανίζεται συχνά δύο φορές μέσα στον ίδιο σύνδεσμο («Άγιος Χ Άγιος Χ» ή «Άγιος ΧΆγιος Χ»)
function undouble(name) {
  const w = name.split(' ');
  if (w.length % 2 === 0 && w.slice(0, w.length / 2).join(' ') === w.slice(w.length / 2).join(' ')) return w.slice(0, w.length / 2).join(' ');
  const half = name.length / 2;
  if (Number.isInteger(half) && name.slice(0, half).trim() === name.slice(half).trim()) return name.slice(0, half).trim();
  return name;
}

// Οι άγιοι της ημέρας είναι κάρτες <div class="w3-quarter …"><a href="/{id}/saint.aspx"> κάτω από το «… εορτάζουν:»·
// το πλήρες όνομα είναι στο title/alt της εικόνας (το κείμενο κόβεται με «....»). Οι υπόλοιποι σύνδεσμοι της σελίδας
// (μενού, πλαϊνές στήλες με προβεβλημένους αγίους) δεν ανήκουν στην ημέρα. Αν αλλάξει η μορφή της σελίδας και δεν
// βρεθούν κάρτες, κρατάμε όλους τους συνδέσμους αγίων.
function parseSaints(html) {
  const out = [];
  const seen = new Set();
  const add = (href, id, inner) => {
    const title = /\b(?:title|alt)\s*=\s*["']([^"']{3,})["']/i.exec(inner);
    let name = decodeEntities((title ? title[1] : inner.replace(/<[^>]*>/g, ' '))).replace(/\s+/g, ' ').trim();
    name = undouble(name);
    if (!name || seen.has(id)) return;
    seen.add(id);
    out.push({ name, url: new URL(href, 'https://www.saint.gr/').href });
  };
  const card = /<div\b[^>]*class=["'][^"']*\bw3-quarter\b[^"']*["'][^>]*>\s*<a\b[^>]*href=["']([^"']*?\/(\d+)\/saint\.aspx)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = card.exec(html))) add(m[1], m[2], m[3]);
  if (out.length) return out;
  const any = /<a\b[^>]*href=["']([^"']*?\/(\d+)\/saint\.aspx)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = any.exec(html))) add(m[1], m[2], m[3]);
  return out;
}

// Κινητές εορτές (εξαρτώνται από το Πάσχα): στη σελίδα του saint.gr μιας ημερομηνίας εμφανίζονται μόνο για το
// τρέχον έτος, οπότε δεν μπαίνουν στα σταθερά δεδομένα (το ημερολόγιό μας τις υπολογίζει για κάθε έτος).
const MOVABLE = [/^[Α-Ω]΄\s*Κυριακή/, /Κυριακή\s+(του|των|της|προ|πρό|μετά)\s/, /Σάββατο\s+(του|των|της)\s/, /Ψυχοσάββατο/, /Πάσχα/, /Πεντηκοστ/,
  /Τριώδ/, /Ανάληψη του Κυρίου/, /Διακαινησίμου/, /Μεγάλ[ηο]\s+(Δευτέρα|Τρίτη|Τετάρτη|Πέμπτη|Παρασκευή|Σάββατο|Εβδομάδα)/, /Καθαρά Δευτέρα/,
  /Ζωοδόχου Πηγής/, /Αγίου Πνεύματος/, /Ακαθίστου/, /Μεγάλου Κανόνος/, /Χαιρετισμ/, /Βαΐων/, /Τελώνου/, /Ασώτου/, /Απόκρεω/, /Τυρινής/];
const isMovable = name => MOVABLE.some(re => re.test(name));

async function fetchSaints(month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const source = `https://www.saint.gr/${mm}/${dd}/index.aspx`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const resp = await fetch(source, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (OrthodoxNotebook)', 'Accept-Language': 'el' },
    });
    if (!resp.ok) throw new Error('saint.gr HTTP ' + resp.status);
    const html = decodeHtml(await resp.arrayBuffer(), resp.headers.get('content-type'));
    return { source, saints: parseSaints(html) };
  } finally {
    clearTimeout(timer);
  }
}

function validDate(m, d) {
  return Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate();
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const m = Number(url.searchParams.get('m'));
  const d = Number(url.searchParams.get('d'));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!validDate(m, d)) {
    res.statusCode = 400;
    res.end(JSON.stringify({ ok: false, error: 'Μη έγκυρη ημερομηνία' }));
    return;
  }
  try {
    const { source, saints } = await fetchSaints(m, d);
    // Ο συναξαριστής μιας ημερομηνίας δεν αλλάζει· κρατάμε αντίγραφο στο CDN για μια μέρα.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, source, saints }));
  } catch (err) {
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: err.name === 'AbortError' ? 'Λήξη χρόνου' : err.message }));
  }
}

module.exports = handler;
module.exports.parseSaints = parseSaints;
module.exports.decodeHtml = decodeHtml;
module.exports.undouble = undouble;
module.exports.fetchSaints = fetchSaints;
module.exports.isMovable = isMovable;

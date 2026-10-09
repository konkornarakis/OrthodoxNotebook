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

// Κάθε άγιος είναι σύνδεσμος της μορφής /{id}/saint.aspx. Κρατάμε μία εγγραφή ανά id.
function parseSaints(html) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']*?\/(\d+)\/saint\.aspx)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const id = m[2];
    let name = decodeEntities(m[3].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    name = undouble(name);
    if (!name || seen.has(id)) continue;
    seen.add(id);
    out.push({ name, url: new URL(m[1], 'https://www.saint.gr/').href });
  }
  return out;
}

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

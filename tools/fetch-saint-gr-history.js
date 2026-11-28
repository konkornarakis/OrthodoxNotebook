// tools/fetch-saint-gr-history.js — το αρχείο αναγνωσμάτων του saint.gr (Ημερολόγιο της Εκκλησίας της Ελλάδος)
//
//   node tools/fetch-saint-gr-history.js [φάκελος-cache] [από έτος] [έως έτος]
//
// Η σελίδα «Ευαγγελικά Αναγνώσματα» του saint.gr (readings.aspx) έχει, για κάθε έτος από το 2011, τη λίστα
// των ημερών με αναγνώσματα και για κάθε ημέρα μια σελίδα (/<id>/readingsday.aspx) με τον Απόστολο, το
// Ευαγγέλιο και το Εωθινό στο αρχαίο κείμενο. (Πλήρη είναι τα έτη 2017 και 2020 κ.ε.· τα παλαιότερα έχουν κενά.)
// Αποθηκεύεται στο tools/readings/saint-gr-history.json, από το οποίο το build-readings-gr-predict.js
// μαθαίνει την τάξη της Εκκλησίας της Ελλάδος για τα έτη που δεν έχουν δημοσιευτεί ακόμη.
// Οι ερμηνευτικές αποδόσεις (Τρεμπέλα, Κολιτσάρα) έχουν πνευματικά δικαιώματα και δεν αποθηκεύονται.
//
// Μορφή: { source, built, days: { 'ΕΕΕΕ-ΜΜ-ΗΗ': { h, r: [[k, αριθμός ενότητας]] } }, blocks: [{ b, ref, i, n?, v }] }

'use strict';

const fs = require('fs');
const path = require('path');
const { parseBlock, text } = require('./build-readings-gr.js');

const [CACHE = '', FROM = '2011', TO = String(new Date().getFullYear())] = process.argv.slice(2);
const OUT = path.join(__dirname, 'readings', 'saint-gr-history.json');
const UA = { 'User-Agent': 'Mozilla/5.0 (OrthodoxNotebook)', 'Accept-Language': 'el' };
const KIND = { 'Ἀπόστολος': 'A', 'Εὐαγγέλιον': 'E', 'Ἑωθινόν': 'H' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, opt = {}) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.text();
      throw new Error('HTTP ' + r.status);
    } catch (e) { if (i >= 4) throw e; await sleep(2000 * i); }
  }
}
const cached = async (name, fn) => {
  const f = CACHE && path.join(CACHE, name);
  if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const h = await fn();
  if (f) fs.writeFileSync(f, h);
  return h;
};

// Μία σελίδα ημέρας → { h, r: [{ k, b, ref, i, n?, v }] }
function parseDay(html) {
  const h = text((/<strong>[^<]*\d{4}<\/strong><br \/>[\s\S]*?<div class="w3-container w3-fourfifth">\s*(?:<strong>)?([\s\S]*?)<\/div>/.exec(html) || [])[1] || '');
  const tabs = [...html.matchAll(/displayTab\(event, 'gospel', 'tablink', '(gID\d+)'[^)]*\);">\s*<div[^>]*>([\s\S]*?)<\/div>/g)].map(m => ({ id: m[1], name: text(m[2]) }));
  const r = [];
  for (const tab of tabs) {
    const start = html.indexOf('id="' + tab.id + 'vID3"');   // vID3: αρχαίο κείμενο
    if (start < 0) continue;
    const end = html.indexOf('id="' + tab.id + 'vID', start + 10);
    const b = parseBlock(html.slice(start, end > 0 ? end : undefined));
    if (b) r.push(Object.assign({ k: KIND[tab.name] || tab.name }, b));
  }
  return { h, r };
}

async function main() {
  if (CACHE) fs.mkdirSync(CACHE, { recursive: true });
  const base = await get('https://www.saint.gr/readings.aspx');
  const field = n => { const m = new RegExp('name="' + n.replace(/\$/g, '\\$') + '"[^>]*value="([^"]*)"').exec(base); return m ? m[1].replace(/&amp;/g, '&') : ''; };
  const list = [];
  for (let y = +FROM; y <= +TO; y++) {
    const html = await cached('list' + y + '.html', () => get('https://www.saint.gr/readings.aspx', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ __VIEWSTATE: field('__VIEWSTATE'), __VIEWSTATEGENERATOR: field('__VIEWSTATEGENERATOR'), __EVENTVALIDATION: field('__EVENTVALIDATION'),
        'ctl00$contentPlaceHolder$ddlYear': String(y), 'ctl00$contentPlaceHolder$btnGo': 'Επιλογή' }),
    }));
    let n = 0;
    for (const m of html.matchAll(/(\d\d)\/(\d\d)\/(\d{4})(?:<\/span>)?&nbsp;-&nbsp;<\/div>\s*<div[^>]*><a href="(\d+)\/readingsday/g)) { list.push([`${m[3]}-${m[2]}-${m[1]}`, m[4]]); n++; }
    console.log(y + ': ' + n + ' ημέρες');
  }
  const days = {}, blocks = [], index = new Map();
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const [date, id] = list[i++];
      let html;
      try { html = await cached(date + '.html', () => get(`https://www.saint.gr/${id}/readingsday.aspx`)); }
      catch (e) { console.log('αποτυχία ' + date + ': ' + e.message); continue; }
      const day = parseDay(html);
      days[date] = { h: day.h, r: day.r.map(({ k, ...b }) => {
        const key = JSON.stringify(b);
        if (!index.has(key)) { index.set(key, blocks.length); blocks.push(b); }
        return [k, index.get(key)];
      }) };
      if (!CACHE || !fs.existsSync(path.join(CACHE, date + '.html'))) await sleep(150);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  const sorted = Object.fromEntries(Object.entries(days).sort());
  fs.writeFileSync(OUT, JSON.stringify({ source: 'https://www.saint.gr/readings.aspx', built: new Date().toISOString().slice(0, 10), days: sorted, blocks }) + '\n');
  console.log('ημέρες ' + Object.keys(sorted).length + ', ενότητες ' + blocks.length + ' → ' + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });

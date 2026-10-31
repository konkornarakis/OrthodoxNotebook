// tools/build-saints.js — όλοι οι άγιοι του έτους από τον Ορθόδοξο Συναξαριστή (saint.gr) σε ένα αρχείο
//
//   node tools/build-saints.js        → data/saints.json  { source, built, days: { "ΜΜ-ΗΗ": [{ name, url }] } }
//
// Το τρέχει το workflow saints-data.yml (χειροκίνητα και μία φορά τον χρόνο), ώστε το Εορτολόγιο να έχει τα
// δεδομένα στο site: ανοίγει αμέσως, δουλεύει χωρίς σύνδεση και δεν εξαρτάται από το saint.gr την ώρα της χρήσης.
// Αν λείπουν πολλές ημέρες, δεν γράφει τίποτα (για να μη χαθούν σωστά δεδομένα).

'use strict';

const fs = require('fs');
const path = require('path');
const { fetchSaints, isMovable } = require('../api/saints.js');

const OUT = path.join(__dirname, '..', 'data', 'saints.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const days = {}, missing = [];
  for (let m = 1; m <= 12; m++) {
    const n = new Date(2024, m, 0).getDate();   // δίσεκτο έτος: και η 29η Φεβρουαρίου
    for (let d = 1; d <= n; d++) {
      const key = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let saints = null;
      for (let attempt = 1; attempt <= 3 && !saints; attempt++) {
        try {
          const r = await fetchSaints(m, d);
          const fixed = r.saints.filter(x => !isMovable(x.name));
          if (fixed.length) saints = fixed;
        } catch (e) { if (attempt === 3) console.error(key, e.message); }
        if (!saints) await sleep(1500 * attempt);
      }
      if (saints) days[key] = saints; else missing.push(key);
      process.stdout.write(key + ' ' + (saints ? saints.length : 'ΧΩΡΙΣ') + '\n');
      await sleep(300);
    }
  }
  if (missing.length > 6) { console.error('Λείπουν ' + missing.length + ' ημέρες: ' + missing.join(', ')); process.exit(1); }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ source: 'https://www.saint.gr/', built: new Date().toISOString().slice(0, 10), days }) + '\n');
  console.log('Γράφτηκαν ' + Object.keys(days).length + ' ημέρες' + (missing.length ? ' (λείπουν: ' + missing.join(', ') + ')' : '') + '.');
}

main().catch(e => { console.error(e); process.exit(1); });

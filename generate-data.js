// generate-data.js
// Reads ./sermons/<folder>/ directories and outputs sermons-data.json
// Run: node generate-data.js
// Vercel runs this automatically on every deploy via vercel.json buildCommand.

'use strict';
const fs   = require('fs');
const path = require('path');

const SERMONS_DIR = path.join(__dirname, 'sermons');
const OUTPUT      = path.join(__dirname, 'sermons-data.json');

// ── Transcript parser ─────────────────────────────────────────────────────────
// Handles format:  "HH:MM:SS Speaker N\ntext…\n\nHH:MM:SS Speaker N\ntext…"
function parseTranscript(raw) {
  if (!raw || !raw.trim()) return [];

  const lines    = raw.split('\n');
  const segments = [];
  let ts    = null;
  let lines_ = [];

  for (const line of lines) {
    // «00:00:02 Speaker 1» ή «[00:00] Ομιλητής 1: κείμενο»
    const m = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/);
    if (m) {
      // Flush previous segment
      if (ts !== null) {
        const text = lines_.join('\n').trim();
        if (text) segments.push({ ts, text });
      }
      ts = m[1].split(':').length === 2 ? '00:' + m[1].padStart(5, '0') : m[1].padStart(8, '0');
      // Rest of line after timestamp — skip if it's just "Speaker N"
      const rest = line.slice(m[0].length).trim();
      lines_ = (rest && !/^(Speaker|Ομιλητής)\s+\d+:?$/i.test(rest)) ? [rest] : [];
    } else if (ts !== null) {
      lines_.push(line);
    }
  }
  // Flush last
  if (ts !== null) {
    const text = lines_.join('\n').trim();
    if (text) segments.push({ ts, text });
  }

  return segments;
}

// ── _Details.txt parser ───────────────────────────────────────────────────────
// Format: "key: value" (one per line). Splits on first colon only so URLs work.
function parseDetails(raw) {
  const out = {};
  for (const line of (raw || '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      const val = line.slice(colon + 1).trim();
      if (val) out[key] = val;
    }
  }
  return out;
}

// ── Folder-name → title + speaker ────────────────────────────────────────────
// Tries " - " separator first, then " _ ", otherwise the full name is the title.
function parseFolderName(name) {
  const di = name.indexOf(' - ');
  if (di !== -1) return { title: name.slice(0, di).trim(), speaker: name.slice(di + 3).trim() };
  const ui = name.indexOf(' _ ');
  if (ui !== -1) return { title: name.slice(0, ui).trim(), speaker: name.slice(ui + 3).trim() };
  return { title: name.trim(), speaker: '' };
}

// ── Read file safely (returns '' if missing / empty) ─────────────────────────
function readSafe(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const sermons = [];

for (const entry of fs.readdirSync(SERMONS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const dir   = path.join(SERMONS_DIR, entry.name);
  const files = fs.readdirSync(dir);

  // η απομαγνητοφώνηση: «_Transcript.txt» ή (παλιά μορφή) «<φάκελος>_Transcript.txt»
  const transcriptFile = files.find(f => f === '_Transcript.txt') || files.find(f => f.endsWith('_Transcript.txt'));
  // το κείμενο μελέτης (Markdown), αν υπάρχει
  const studyFile      = files.find(f => f === '_Keimeno.md');
  const summaryFile    = files.find(f => f === '_Summary.txt');
  const detailsFile    = files.find(f => f === '_Details.txt');

  const transcript = parseTranscript(readSafe(transcriptFile ? path.join(dir, transcriptFile) : ''));
  const summary    = readSafe(summaryFile ? path.join(dir, summaryFile) : '').trim();
  const details    = parseDetails(readSafe(detailsFile ? path.join(dir, detailsFile) : ''));

  const { title: nameTitle, speaker: nameSpeaker } = parseFolderName(entry.name);
  const study = readSafe(studyFile ? path.join(dir, studyFile) : '').trim();
  // χωρίς περίληψη: η «Σύντομη περίληψη» του κειμένου μελέτης, σε απλό κείμενο
  let studySummary = '';
  const sm = /^###\s+Σύντομη περίληψη\s*\n([\s\S]*?)(?=\n#{2,3}\s)/m.exec(study);
  if (sm) studySummary = sm[1].replace(/\*\*|__|\*|\[([^\]]+)\]\([^)]+\)/g, (m, t) => t || '').trim();

  sermons.push({
    id:         entry.name,
    title:      details.title   || nameTitle,
    speaker:    details.speaker || nameSpeaker,
    date:       details.date    || '',
    url:        details.url     || '',
    tags:       details.tags    ? details.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    summary:    details.summary || summary || studySummary,
    transcript,
    study,
  });
}

// Sort: dated entries newest first, undated entries at end
sermons.sort((a, b) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return b.date.localeCompare(a.date);
});

fs.writeFileSync(OUTPUT, JSON.stringify(sermons, null, 2), 'utf8');
console.log(`✓ Generated ${sermons.length} sermon(s) → sermons-data.json`);
sermons.forEach(s => console.log(`  • ${s.title}${s.speaker ? ' — ' + s.speaker : ''} [${s.transcript.length} segments]`));

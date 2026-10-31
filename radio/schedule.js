// radio/schedule.js — το πρόγραμμα ηχογράφησης του ραδιοφώνου (κοινό για το workflow και τη διαχείριση)
//
// Ρυθμίσεις (radio/config.json):
//   {
//     "enabled": true,                                   // αυτόματες ηχογραφήσεις
//     "quality": { "bitrate": 96, "channels": 1 },       // kbps, 1 = mono, 2 = stereo
//     "retentionDays": 0,                                // διαγραφή μετά από τόσες ημέρες (0 = ποτέ)
//     "maxGB": 0,                                        // ανώτατος χώρος· σβήνονται οι παλαιότερες (0 = χωρίς όριο)
//     "rules": [
//       { "id": "night", "label": "Νυχτερινό", "days": [0,1,2,3,4,5,6], "start": "22:00", "end": "03:00", "enabled": true },
//       { "id": "x1", "label": "Ομιλία", "date": "2026-11-05", "start": "18:00", "end": "19:30", "enabled": true },
//       { "id": "s1", "label": "Απόδειπνο", "show": "Η Ακολουθία του Αποδείπνου", "match": "exact", "days": [0,1,2,3,4,5,6],
//         "padBefore": 1, "padAfter": 2, "skip": ["2026-11-07"], "enabled": true }
//     ]
//   }
// days: 0 = Δευτέρα … 6 = Κυριακή. Αν η λήξη είναι πριν την έναρξη, η ηχογράφηση περνά τα μεσάνυχτα.
// Κανόνας «show»: κάθε φορά που μεταδίδεται η εκπομπή (τίτλος ακριβώς ή «περιέχει»), με ώρα και διάρκεια από το
// πρόγραμμα του σταθμού (week = { ΔΕΥΤΕΡΑ: [["ΩΩ:ΛΛ", "Τίτλος", "…"], …], … }, βλ. radio/program.js)· ακολουθεί
// έτσι αλλαγές ώρας, διάρκειας και ημέρας. Χωρίς πρόγραμμα σταθμού οι κανόνες «show» δεν δίνουν παράθυρα.
// skip: ημερομηνίες που παραλείπονται («μόνο αυτή τη φορά όχι») σε επαναλαμβανόμενους κανόνες.
// Όλες οι ώρες είναι ώρα Ελλάδας.
//
// Από το workflow:  node radio/schedule.js decide <config.json> <control.json>   (env EVENT, HOURS, NOW)
// τυπώνει γραμμές key=value για το $GITHUB_OUTPUT. Στον browser (radio-admin.html) είναι το window.RadioSchedule.

(function () {
'use strict';

const TZ = 'Europe/Athens';
const LEAD_MS = 35 * 60e3;          // ένα προγραμματισμένο τρέξιμο ξεκινά έως 35′ νωρίτερα και περιμένει
const JOB_CAP_MS = 340 * 60e3;      // μια δουλειά του GitHub ζει έως 6 ώρες· τα υπόλοιπα τα συνεχίζει η επόμενη
const MERGE_GAP_MS = 60e3;          // παράθυρα που απέχουν έως 1′ ενώνονται σε μία ηχογράφηση
const BITRATES = [32, 48, 64, 96, 128, 160, 192];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_DAYS = ['ΔΕΥΤΕΡΑ', 'ΤΡΙΤΗ', 'ΤΕΤΑΡΤΗ', 'ΠΕΜΠΤΗ', 'ΠΑΡΑΣΚΕΥΗ', 'ΣΑΒΒΑΤΟ', 'ΚΥΡΙΑΚΗ'];   // όπως στο radio/program.js
// Τίτλος για σύγκριση: χωρίς τόνους/πνεύματα, σημεία στίξης και κεφαλαία
const titleKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const fmtParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// epoch ms → ημερομηνία/ώρα Ελλάδας
function athensParts(ms) {
  const p = fmtParts.formatToParts(new Date(ms)).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd: WD[p.weekday] };
}
// ώρα Ελλάδας → epoch ms (ώρα που δεν υπάρχει λόγω αλλαγής ώρας μετατοπίζεται μία ώρα)
function athensToEpoch(y, mo, d, h, mi, s = 0) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const offset = ms => { const p = athensParts(ms); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms; };
  const o1 = offset(guess), o2 = offset(guess - o1);
  return guess - (o1 === o2 ? o1 : o2);
}
const pad = n => String(n).padStart(2, '0');
const dateStr = (y, mo, d) => y + '-' + pad(mo) + '-' + pad(d);
function addDays(date, n) {
  const [y, mo, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return dateStr(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const weekday = date => { const [y, mo, d] = date.split('-').map(Number); return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7; };
const athensDate = ms => { const p = athensParts(ms); return dateStr(p.y, p.mo, p.d); };
const at = (date, hm) => { const [y, mo, d] = date.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return athensToEpoch(y, mo, d, h, mi, 0); };

// Παλιές ρυθμίσεις { enabled, start, end } → κανόνας για κάθε ημέρα· έλεγχος τιμών
function normalize(cfg) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  let rules = Array.isArray(cfg.rules) ? cfg.rules : null;
  if (!rules) rules = [{ id: 'daily', label: 'Καθημερινή', days: [0, 1, 2, 3, 4, 5, 6], start: HM.test(cfg.start) ? cfg.start : '22:00', end: HM.test(cfg.end) ? cfg.end : '03:00', enabled: true }];
  const q = cfg.quality || {};
  const dayList = d => [...new Set((Array.isArray(d) ? d : []).map(Number).filter(n => n >= 0 && n <= 6))].sort();
  const mins = v => Math.min(60, Math.max(0, Math.round(Number(v) || 0)));
  const skip = r => [...new Set((Array.isArray(r.skip) ? r.skip : []).filter(x => DATE.test(x)))].sort().slice(-200);
  return {
    enabled: cfg.enabled !== false,
    quality: { bitrate: BITRATES.includes(Number(q.bitrate)) ? Number(q.bitrate) : 96, channels: Number(q.channels) === 2 ? 2 : 1 },
    retentionDays: Math.max(0, Math.floor(Number(cfg.retentionDays) || 0)),
    maxGB: Math.max(0, Number(cfg.maxGB) || 0),
    rules: rules.filter(r => r && (typeof r.show === 'string' ? !!titleKey(r.show)
        : HM.test(r.start) && HM.test(r.end) && r.start !== r.end && (DATE.test(r.date || '') || dayList(r.days).length)))
      .map((r, i) => {
        const base = { id: String(r.id || 'r' + (i + 1)).slice(0, 40), label: String(r.label || '').slice(0, 80), enabled: r.enabled !== false };
        if (typeof r.show === 'string') return { ...base, show: r.show.slice(0, 160), match: r.match === 'contains' ? 'contains' : 'exact', days: dayList(r.days).length ? dayList(r.days) : [0, 1, 2, 3, 4, 5, 6], padBefore: mins(r.padBefore), padAfter: mins(r.padAfter), skip: skip(r) };
        if (DATE.test(r.date || '')) return { ...base, date: r.date, start: r.start, end: r.end };
        return { ...base, days: dayList(r.days), start: r.start, end: r.end, skip: skip(r) };
      }),
  };
}

// Λάθη που πρέπει να δει ο χρήστης πριν την αποθήκευση
function validate(cfg) {
  const errs = [];
  if (!cfg || typeof cfg !== 'object') return ['Μη έγκυρες ρυθμίσεις.'];
  for (const [i, r] of (cfg.rules || []).entries()) {
    const n = 'Κανόνας ' + (i + 1) + (r && r.label ? ' («' + r.label + '»)' : '');
    if (r && typeof r.show === 'string') { if (!titleKey(r.show)) errs.push(n + ': γράψε τον τίτλο της εκπομπής.'); if (Array.isArray(r.days) && !r.days.length) errs.push(n + ': διάλεξε τουλάχιστον μία ημέρα.'); continue; }
    if (!r || !HM.test(r.start) || !HM.test(r.end)) errs.push(n + ': μη έγκυρη ώρα.');
    else if (r.start === r.end) errs.push(n + ': η έναρξη και η λήξη είναι ίδιες.');
    if (r && !DATE.test(r.date || '') && !(Array.isArray(r.days) && r.days.length)) errs.push(n + ': διάλεξε ημέρες ή ημερομηνία.');
  }
  const q = cfg.quality || {};
  if (q.bitrate != null && !BITRATES.includes(Number(q.bitrate))) errs.push('Μη έγκυρη ποιότητα.');
  if (cfg.retentionDays != null && !(Number(cfg.retentionDays) >= 0)) errs.push('Μη έγκυρες ημέρες διατήρησης.');
  if (cfg.maxGB != null && !(Number(cfg.maxGB) >= 0)) errs.push('Μη έγκυρο όριο χώρου.');
  return errs;
}

// Οι εκπομπές του σταθμού που ταιριάζουν σε κανόνα «show» μια ημέρα: [{ start, end, title }]
function showMatches(r, week, d) {
  if (!week) return [];
  const rows = week[WEEK_DAYS[weekday(d)]] || [], key = titleKey(r.show), out = [];
  rows.forEach((row, i) => {
    const t = titleKey(row[1]);
    if (!(r.match === 'contains' ? t.includes(key) : t === key)) return;
    const s = at(d, row[0]);
    let e;
    if (rows[i + 1]) e = at(d, rows[i + 1][0]);
    else { const nx = (week[WEEK_DAYS[weekday(addDays(d, 1))]] || [])[0]; e = nx ? at(addDays(d, 1), nx[0]) : s + 3600e3; }
    if (e <= s) e = s + 3600e3;
    out.push({ start: s, end: e, title: row[1] });
  });
  return out;
}

// Τα παράθυρα ηχογράφησης κάθε κανόνα που αγγίζουν το [from, to) (χωρίς ένωση)
function ruleWindows(cfg, from, to, week) {
  cfg = normalize(cfg);
  const out = [];
  if (!cfg.enabled) return out;
  const first = addDays(athensDate(from), -1), last = athensDate(to);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const wd = weekday(d);
    for (const r of cfg.rules) {
      if (!r.enabled || (r.skip && r.skip.includes(d))) continue;
      if (r.show) {
        if (!r.days.includes(wd)) continue;
        for (const m of showMatches(r, week, d)) {
          const s = m.start - r.padBefore * 60e3, e = m.end + r.padAfter * 60e3;
          if (e > from && s < to) out.push({ start: s, end: e, labels: [r.label || m.title], rule: r.id, date: d });
        }
        continue;
      }
      if (r.date ? r.date !== d : !r.days.includes(wd)) continue;
      const s = at(d, r.start);
      let e = at(d, r.end);
      if (e <= s) e = at(addDays(d, 1), r.end);
      if (e > from && s < to) out.push({ start: s, end: e, labels: [r.label || ''], rule: r.id, date: d });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// Τα παράθυρα ηχογράφησης που αγγίζουν το [from, to), ενωμένα όπου επικαλύπτονται
function windows(cfg, from, to, week) {
  const merged = [];
  for (const w of ruleWindows(cfg, from, to, week)) {
    const m = merged[merged.length - 1];
    if (m && w.start <= m.end + MERGE_GAP_MS) { m.end = Math.max(m.end, w.end); m.labels.push(...w.labels); m.rules.push(w.rule); }
    else merged.push({ start: w.start, end: w.end, labels: w.labels.slice(), rules: [w.rule] });
  }
  for (const m of merged) { m.labels = [...new Set(m.labels.filter(Boolean))]; m.rules = [...new Set(m.rules)]; }
  return merged;
}

// Τι κάνει τώρα ένα τρέξιμο του workflow
//   event: schedule | push (εντολή από τη διαχείριση) | workflow_dispatch
function decide({ config, control, now, event, hours, week }) {
  const cfg = normalize(config);
  const ctl = control || {};
  let start = null, end = null, why = '';
  if (event === 'workflow_dispatch' && Number(hours) > 0) {
    start = now; end = now + Number(hours) * 3600e3; why = 'χειροκίνητα';
  } else if (event === 'push') {
    if (ctl.cmd === 'start' && ctl.until * 1000 > now + 60e3) { start = now; end = ctl.until * 1000; why = 'από τη διαχείριση'; }
    else return { skip: 'Καμία εντολή έναρξης.' };
  } else {
    if (!cfg.enabled) return { skip: 'Οι αυτόματες ηχογραφήσεις είναι ανενεργές.' };
    const w = windows(cfg, now - 24 * 3600e3, now + 24 * 3600e3, week).find(x => now >= x.start - LEAD_MS && now < x.end - 120e3);
    if (!w) return { skip: 'Εκτός προγράμματος.' };
    if (ctl.cmd === 'stop' && ctl.at * 1000 >= w.start - LEAD_MS) return { skip: 'Διακόπηκε από τη διαχείριση για αυτό το παράθυρο.' };
    start = Math.max(now, w.start); end = w.end; why = w.labels.join(', ') || 'πρόγραμμα';
  }
  end = Math.min(end, now + JOB_CAP_MS);
  return { start, end, day: athensDate(start - 6 * 3600e3), why, bitrate: cfg.quality.bitrate, channels: cfg.quality.channels };
}

// Εκτίμηση χώρου για το πρόγραμμα και την ποιότητα
function estimate(cfg, now = Date.now(), week = null) {
  cfg = normalize(cfg);
  const bytesPerHour = cfg.quality.bitrate * 1000 / 8 * 3600;
  // εβδομαδιαίες ώρες από τους επαναλαμβανόμενους κανόνες (οι μοναδικές ημερομηνίες μετρώνται χωριστά)
  const weekly = normalize({ ...cfg, rules: cfg.rules.filter(r => !r.date) });
  const monday = (() => { const d = athensDate(now); return addDays(d, -weekday(d) + 7); })();   // μια ολόκληρη επόμενη εβδομάδα
  const wFrom = at(monday, '00:00'), wTo = at(addDays(monday, 7), '00:00');
  const hoursPerWeek = cfg.enabled ? windows(weekly, wFrom, wTo, week).reduce((a, w) => a + (Math.min(w.end, wTo) - Math.max(w.start, wFrom)) / 3600e3, 0) : 0;
  const oneOff = cfg.enabled ? windows(normalize({ ...cfg, rules: cfg.rules.filter(r => r.date) }), now, now + 400 * 86400e3).reduce((a, w) => a + (w.end - Math.max(w.start, now)) / 3600e3, 0) : 0;
  const perDay = hoursPerWeek / 7 * bytesPerHour;
  return {
    bytesPerHour, hoursPerWeek, oneOffHours: oneOff,
    perDay, perMonth: perDay * 30.44, perYear: perDay * 365.25 + oneOff * bytesPerHour,
    steady: cfg.retentionDays ? perDay * cfg.retentionDays : null,
  };
}

// Ποιες ημέρες σβήνει η αυτόματη διατήρηση (recs: [{ tag, date, bytes }], από την παλαιότερη).
// Δεν αγγίζει ποτέ τη σημερινή και τη χθεσινή ημέρα (μπορεί να γράφονται ακόμη).
function cleanupPlan(recs, config, now = Date.now()) {
  const cfg = normalize(config);
  recs = recs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const today = athensDate(now), keepFrom = addDays(today, -1);
  const del = new Set();
  if (cfg.retentionDays) {
    const limit = addDays(today, -cfg.retentionDays);
    for (const r of recs) if (r.date < limit && r.date < keepFrom) del.add(r.tag);
  }
  if (cfg.maxGB) {
    let total = recs.filter(r => !del.has(r.tag)).reduce((a, r) => a + r.bytes, 0);
    for (const r of recs) {
      if (total <= cfg.maxGB * 1e9) break;
      if (del.has(r.tag) || r.date >= keepFrom) continue;
      del.add(r.tag); total -= r.bytes;
    }
  }
  return recs.filter(r => del.has(r.tag));
}

const api = { TZ, BITRATES, LEAD_MS, JOB_CAP_MS, WEEK_DAYS, titleKey, athensParts, athensToEpoch, athensDate, addDays, weekday, at, normalize, validate, showMatches, ruleWindows, windows, decide, estimate, cleanupPlan };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RadioSchedule = api;

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module && process.argv[2] === 'decide') {
  const fs = require('fs');
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
  const now = process.env.NOW ? Number(process.env.NOW) * 1000 : Date.now();
  const week = read(process.argv[5]);
  const r = decide({ config: read(process.argv[3]), control: read(process.argv[4]), now, event: process.env.EVENT || 'schedule', hours: process.env.HOURS, week: week && week.ΔΕΥΤΕΡΑ ? week : null });
  if (r.skip) { console.log('skip=1'); console.log('why=' + r.skip); }
  else for (const k of ['start', 'end']) console.log(k + '=' + Math.round(r[k] / 1000));
  if (!r.skip) for (const k of ['day', 'why', 'bitrate', 'channels']) console.log(k + '=' + r[k]);
}
})();

// tools/readings/lectionary.js — ποιος Απόστολος και ποιο Ευαγγέλιο διαβάζονται κάθε ημέρα
//
// Υπολογισμός κατά την ελληνική (κωνσταντινουπολίτικη) τάξη: ο κύκλος του Πάσχα, το «άλμα» του
// Λουκά μετά την Ύψωση, οι αριθμημένες Κυριακές του Λουκά, οι Κυριακές μεταξύ Θεοφανείων και
// Τριωδίου, οι κινητές εορτές και οι εορτές του Μηναίου.
//
// Τα δεδομένα (lectionary.json) και οι κανόνες προέρχονται από το orthocal-python
// (MIT License, © 2022 Brian Glass), που τα έχει ελέγξει με τα ημερολόγια της Ελληνικής
// Ορθόδοξης Αρχιεπισκοπής Αμερικής (goarch.org). Ο κώδικας εδώ είναι νέος, σε JavaScript,
// και τρέχει μόνο κατά την κατασκευή των αρχείων readings/*.json (build.js).

'use strict';

const DATA = require('./lectionary.json');

const SUN = 0, MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6;
const mod = (a, n) => ((a % n) + n) % n;

// ── Ημερομηνίες ως αριθμοί ημερών ──────────────────────────────────────────
const dayNum = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 864e5);
function fromDayNum(n) { const t = new Date(n * 864e5); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }

// Ορθόδοξο Πάσχα (στο γρηγοριανό ημερολόγιο), 1900–2099
function pascha(y) {
  const a = y % 4, b = y % 7, c = y % 19;
  const d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31), day = ((d + e + 114) % 31) + 1;
  return dayNum(y, month, day) + 13;   // ιουλιανό → γρηγοριανό
}

const weekday = p => mod(p, 7);   // το Πάσχα είναι Κυριακή
function surrounding(p) {
  const w = weekday(p);
  return [p - w - 1, p - 7 + mod(7 - w, 7), p + 7 - mod(w + 1, 7), p + 7 - w];
}

// ── Κινητές εορτές (δείκτες στα δεδομένα) ──────────────────────────────────
const F = {
  FathersSix: 1001, FathersSeventh: 1002, DemetriusSaturday: 1003, SynaxisUnmercenaries: 1004,
  SatBeforeElevationMoved: 1005, SatBeforeElevation: 1006, SunBeforeElevation: 1007, SatAfterElevation: 1008,
  SunAfterElevation: 1009, SunForefathers: 1010, SatBeforeNativity: 1011, SunBeforeNativity: 1012,
  RoyalHoursNativityFriday: 1013, EveNativity: 1014, SatBeforeNativityEve: 1015, SunBeforeNativityEve: 1016,
  SatAfterNativityBeforeTheophany: 1017, SatAfterNativityFriday: 1018, SatAfterNativity: 1019,
  SunAfterNativityMonday: 1020, SunAfterNativity: 1021, SatBeforeTheophany: 1022, SatBeforeTheophanyJan: 1023,
  SunBeforeTheophany: 1024, RoyalHoursTheophanyFriday: 1025, TheophanyEve: 1026, SatBeforeTheophanyEve: 1027,
  SunBeforeTheophanyEve: 1028, SatAfterTheophany: 1029, SunAfterTheophany: 1030, NewMartyrsRussia: 1031,
  AnnunciationParemFriday: 1032, AnnunciationSat: 1033, AnnunciationSun: 1034, AnnunciationMon: 1035,
  AnnunciationParemEve: 1036, AnnunciationWeekday: 1037, LeavetakingTheophanyWeekday: 1038, RaphaelBrooklyn: 1039,
};

// ── Το λειτουργικό έτος (από Κυριακή του Ζακχαίου σε Κυριακή του Ζακχαίου) ─────
const YEARS = new Map();
function Year(y) {
  if (YEARS.has(y)) return YEARS.get(y);
  const Y = { year: y, pascha: pascha(y), nextPascha: pascha(y + 1) };
  YEARS.set(y, Y);
  const at = (m, d, yy = y) => dayNum(yy, m, d) - Y.pascha;
  Y.at = at;
  Y.elevation = at(9, 14); Y.theophany = at(1, 6, y + 1); Y.nativity = at(12, 25); Y.annunciation = at(3, 25);
  Y.nativityTheotokos = at(9, 8);
  [Y.satBeforeElevation, Y.sunBeforeElevation, Y.satAfterElevation, Y.sunAfterElevation] = surrounding(Y.elevation);
  [Y.satBeforeTheophany, Y.sunBeforeTheophany, Y.satAfterTheophany, Y.sunAfterTheophany] = surrounding(Y.theophany);
  [Y.satBeforeNativity, Y.sunBeforeNativity, Y.satAfterNativity, Y.sunAfterNativity] = surrounding(Y.nativity);

  { const p = at(7, 16), w = weekday(p); Y.fathersSix = w < THU ? p - w : p + 7 - w; }
  { let p = at(10, 11); const w = weekday(p); if (w > SUN) p += 7 - w; Y.fathersSeven = p; }
  { const p = at(10, 26); Y.demetriusSaturday = p - weekday(p) - 1; }
  { const p = at(11, 1); Y.synaxisUnmercenaries = p + 7 - weekday(p); Y.raphaelBrooklyn = p + mod(SAT - weekday(p), 7); }
  Y.forefathers = Y.nativity - 14 + mod(7 - weekday(Y.nativity), 7);
  { const p = at(1, 25, y + 1), w = weekday(p); Y.newMartyrsRussia = w < THU ? p - w : p - w + 7; }

  Y.lukanJump = (49 + 1 + 7 * 17) - (Y.sunAfterElevation + 1);
  Y.lukanJumpThreshold = Y.sunAfterElevation;
  Y.firstSunLuke = Y.sunAfterElevation + 7;

  // ημέρες χωρίς τα αναγνώσματα του κύκλου
  Y.noDaily = new Set([Y.sunBeforeTheophany, Y.sunAfterTheophany, Y.theophany - 5, Y.theophany - 1, Y.theophany,
    Y.forefathers, Y.sunBeforeNativity, Y.nativity - 1, Y.nativity, Y.nativity + 1, Y.sunAfterNativity]);
  if (Y.satAfterTheophany === Y.theophany + 1) Y.noDaily.add(Y.satAfterTheophany);
  if (weekday(Y.annunciation) === SAT) Y.noDaily.add(Y.annunciation);

  // κινητές εορτές
  const fl = new Map([
    [Y.fathersSix, F.FathersSix], [Y.fathersSeven, F.FathersSeventh], [Y.demetriusSaturday, F.DemetriusSaturday],
    [Y.synaxisUnmercenaries, F.SynaxisUnmercenaries], [Y.raphaelBrooklyn, F.RaphaelBrooklyn],
    [Y.sunBeforeElevation, F.SunBeforeElevation], [Y.satAfterElevation, F.SatAfterElevation],
    [Y.sunAfterElevation, F.SunAfterElevation], [Y.forefathers, F.SunForefathers],
    [Y.satAfterTheophany, F.SatAfterTheophany], [Y.sunAfterTheophany, F.SunAfterTheophany],
    [Y.newMartyrsRussia, F.NewMartyrsRussia],
  ]);
  const lt = Y.theophany + 8;
  if (weekday(lt) !== SAT && weekday(lt) !== SUN) fl.set(lt, F.LeavetakingTheophanyWeekday);
  if (Y.satBeforeElevation === Y.nativityTheotokos) fl.set(Y.elevation - 1, F.SatBeforeElevationMoved);
  else fl.set(Y.satBeforeElevation, F.SatBeforeElevation);
  const eve = Y.nativity - 1;
  if (eve === Y.satBeforeNativity) {
    fl.set(Y.nativity - 2, F.RoyalHoursNativityFriday); fl.set(Y.sunBeforeNativity, F.SunBeforeNativity); fl.set(eve, F.SatBeforeNativityEve);
  } else if (eve === Y.sunBeforeNativity) {
    fl.set(Y.nativity - 3, F.RoyalHoursNativityFriday); fl.set(Y.satBeforeNativity, F.SatBeforeNativity); fl.set(eve, F.SunBeforeNativityEve);
  } else {
    fl.set(eve, F.EveNativity); fl.set(Y.satBeforeNativity, F.SatBeforeNativity); fl.set(Y.sunBeforeNativity, F.SunBeforeNativity);
  }
  switch (weekday(Y.nativity)) {
    case SUN:
      fl.set(Y.satAfterNativity, F.SatAfterNativityBeforeTheophany); fl.set(Y.nativity + 1, F.SunAfterNativityMonday);
      fl.set(Y.sunBeforeTheophany, F.SunBeforeTheophany); fl.set(Y.theophany - 1, F.TheophanyEve); break;
    case MON:
      fl.set(Y.satAfterNativity, F.SatAfterNativityBeforeTheophany); fl.set(Y.sunAfterNativity, F.SunAfterNativity);
      fl.set(Y.theophany - 5, F.SatBeforeTheophanyJan); fl.set(Y.theophany - 1, F.TheophanyEve); break;
    case TUE:
      fl.set(Y.satAfterNativity, F.SatAfterNativity); fl.set(Y.sunAfterNativity, F.SunAfterNativity);
      fl.set(Y.satBeforeTheophany, F.SatBeforeTheophanyEve); fl.set(Y.theophany - 5, F.SatBeforeTheophanyJan);
      fl.set(Y.theophany - 2, F.RoyalHoursTheophanyFriday); break;
    case WED:
      fl.set(Y.satAfterNativity, F.SatAfterNativity); fl.set(Y.sunAfterNativity, F.SunAfterNativity);
      fl.set(Y.satBeforeTheophany, F.SatBeforeTheophany); fl.set(Y.sunBeforeTheophany, F.SunBeforeTheophanyEve);
      fl.set(Y.theophany - 3, F.RoyalHoursTheophanyFriday); break;
    case THU: case FRI:
      fl.set(Y.satAfterNativity, F.SatAfterNativity); fl.set(Y.sunAfterNativity, F.SunAfterNativity);
      fl.set(Y.satBeforeTheophany, F.SatBeforeTheophany); fl.set(Y.sunBeforeTheophany, F.SunBeforeTheophany);
      fl.set(Y.theophany - 1, F.TheophanyEve); break;
    case SAT:
      fl.set(Y.nativity + 6, F.SatAfterNativityFriday); fl.set(Y.sunAfterNativity, F.SunAfterNativity);
      fl.set(Y.satBeforeTheophany, F.SatBeforeTheophany); fl.set(Y.sunBeforeTheophany, F.SunBeforeTheophany);
      fl.set(Y.theophany - 1, F.TheophanyEve); break;
  }
  switch (weekday(Y.annunciation)) {
    case SAT: fl.set(Y.annunciation - 1, F.AnnunciationParemFriday); fl.set(Y.annunciation, F.AnnunciationSat); break;
    case SUN: fl.set(Y.annunciation, F.AnnunciationSun); break;
    case MON: fl.set(Y.annunciation, F.AnnunciationMon); break;
    default: fl.set(Y.annunciation - 1, F.AnnunciationParemEve); fl.set(Y.annunciation, F.AnnunciationWeekday);
  }
  Y.floats = fl;

  // ── Οι αριθμημένες Κυριακές του Λουκά (ελληνική τάξη) ──
  const windows = [[10, 11, 10, 17, 4], [10, 30, 11, 5, 5], [11, 24, 11, 30, 13], [12, 1, 12, 3, 14], [12, 4, 12, 10, 10], [12, 11, 12, 17, 11]]
    .map(([m1, d1, m2, d2, n]) => [at(m1, d1), at(m2, d2), n]);
  const reserved = new Set(windows.map(w => w[2]));
  const overrides = new Set([[10, 18], [11, 16], [11, 30]].map(([m, d]) => at(m, d)));
  Y.lukanNumbers = new Map();
  let next = 1;
  for (let p = Y.firstSunLuke; p <= Y.forefathers; p += 7) {
    const w = windows.find(([s, e]) => s <= p && p <= e);
    let n;
    if (w) n = w[2];
    else { while (reserved.has(next)) next++; n = next++; }
    if (!overrides.has(p)) Y.lukanNumbers.set(p, n);
  }
  Y.triodionStart = Y.nextPascha - Y.pascha - 70;
  Y.greekExtraSundays = Math.floor((Y.triodionStart - Y.sunAfterTheophany) / 7);
  Y.regularExtraSundays = Y.greekExtraSundays - (weekday(Y.theophany + 8) === SUN ? 1 : 0);
  const used = new Set([...Y.lukanNumbers.values()].filter(Boolean));
  const pool = [[null, 12], [null, 15], [null, 14], ['matthew', 16], ['matthew', 15]]
    .filter(([b, n]) => b === 'matthew' || !used.has(n));
  const chosen = pool.slice(0, Math.max(Y.regularExtraSundays - 2, 0))
    .sort((a, b) => ((a[0] === 'matthew') - (b[0] === 'matthew')) || a[1] - b[1]);
  const entries = (Y.regularExtraSundays !== Y.greekExtraSundays ? [['direct', F.SunAfterTheophany]] : []).concat(chosen);
  Y.interpolation = new Map();
  entries.forEach((e, i) => Y.interpolation.set(Y.sunAfterTheophany + 7 * (i + 1), e));
  return Y;
}
const lukanTarget = n => 168 + 7 * n;
const matthewTarget = n => 49 + 7 * n;
function canaanite(Y) { return Year(Y.year - 1).regularExtraSundays >= 4; }
function sundayGospelOverride(Y, p) {
  if (p === -77 && canaanite(Y)) return matthewTarget(17);
  if (Y.firstSunLuke <= p && p <= Y.forefathers) {
    const n = Y.lukanNumbers.get(p);
    return n === undefined ? false : lukanTarget(n);
  }
  const e = Y.interpolation.get(p);
  if (e) return e[0] === 'matthew' ? matthewTarget(e[1]) : e[0] === 'direct' ? e[1] : lukanTarget(e[1]);
  return null;
}
function sundayEpistleOverride(Y, p) {
  if (Y.firstSunLuke <= p && p <= Y.forefathers) return Y.lukanNumbers.has(p) ? null : false;
  return sundayGospelOverride(Y, p);
}

// ── Πίνακες δεδομένων ───────────────────────────────────────────────────────
const DAYS = DATA.days.map(([pdist, month, day, tradition, feast_level, fast_exception, title, subtitle, feast_name]) =>
  ({ pdist, month, day, tradition, feast_level, fast_exception, title, subtitle, feast_name }));
const READINGS = DATA.readings.map(([pdist, month, day, source, desc, pericope, ordering, tradition], i) =>
  ({ i, pdist, month, day, source, desc, pericope, ordering, tradition }));
const ORDO = DATA.ordo.filter(o => o[0] === 'greek');

const SLAVIC_FLOATS = new Set([F.DemetriusSaturday, F.SynaxisUnmercenaries, F.NewMartyrsRussia, F.RaphaelBrooklyn]);
const SLAVIC_SAINTS = new Set(['St Seraphim@1/2', 'St Seraphim@7/19', 'St Anthony@7/10', 'St Innocent@3/31', 'St Tikhon@4/7',
  'St Tikhon@8/13', 'St Vladimir@7/15', 'Boris and Gleb@7/24', 'St Jacob@7/26', 'St Sergius@9/25', 'St Herman@12/13',
  'St Raphael@2/27', 'New Martyrs@9/24', 'Earthquake@10/26', 'St Alexis@5/7']);
// μνήμες του Μηναίου που, όταν πέφτουν Κυριακή, δίνουν τον Απόστολο (το Ευαγγέλιο μένει της Κυριακής)
const sundaySaint = r => r.tradition === 'greek' || /^St |^Hierarchs$|^Apostles$|^Prophet |^Martyrs$|^Angels$|^Forerunner$/.test(r.desc);

function mergeDays(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (r.tradition !== 'greek' && r.tradition !== 'common') continue;
    const k = r.pdist + '/' + r.month + '/' + r.day;
    if (!groups.has(k)) groups.set(k, {});
    groups.get(k)[r.tradition] = r;
  }
  return [...groups.values()].map(g => {
    const base = g.common, over = g.greek;
    const row = Object.assign({}, base || over);
    if (base && over) for (const f of ['feast_level', 'fast_exception']) if (over[f] !== null) row[f] = over[f];
    for (const f of ['feast_level', 'fast_exception']) if (row[f] === null) row[f] = 0;
    return row;
  });
}
function preferTradition(rows) {
  const kept = [], idx = new Map();
  for (const r of rows) {
    if (r.tradition !== 'greek' && r.tradition !== 'common') continue;
    const k = [r.pdist, r.month, r.day, r.source, r.ordering, r.desc].join('|');
    if (idx.has(k)) { if (r.tradition !== 'common') kept[idx.get(k)] = r; }
    else { idx.set(k, kept.length); kept.push(r); }
  }
  return kept;
}

// ── Μία ημέρα ───────────────────────────────────────────────────────────────
function dayInfo(y, m, d) {
  const jdn = dayNum(y, m, d);
  let py = y, pdist = jdn - pascha(y);
  if (pdist < -77) { py = y - 1; pdist = jdn - pascha(py); }
  const Y = Year(py), wd = weekday(pdist);
  const floatIndex = Y.floats.get(pdist);

  const days = mergeDays(DAYS.filter(r => r.pdist === pdist || (floatIndex && r.pdist === floatIndex) || (r.month === m && r.day === d)));
  const feastLevel = days.length ? Math.max(...days.map(r => r.feast_level)) : 0;
  const fastException = days.length ? Math.max(...days.map(r => r.fast_exception)) : 0;
  const daily = !Y.noDaily.has(pdist);
  const sunG = wd === SUN ? sundayGospelOverride(Y, pdist) : null;
  const sunE = wd === SUN ? sundayEpistleOverride(Y, pdist) : null;

  let epistle = null;
  if (daily && sunE !== false) {
    if (sunE !== null) epistle = sunE;
    else if (pdist === 49 + 29 * 7) epistle = Y.forefathers;
    else if (pdist >= 49 + 32 * 7) epistle = jdn - Y.nextPascha;
    else epistle = pdist;
  }
  let gospel = null;
  if (daily) {
    const ordo = ORDO.find(o => o[1] === y && o[2] === m && o[3] === d && o[4] === 'Gospel');
    if (ordo) gospel = ordo[5];
    else if (sunG === false) gospel = null;
    else if (sunG !== null) gospel = sunG;
    else if (pdist === Y.firstSunLuke + 70) gospel = Y.forefathers + Y.lukanJump;
    else if (pdist > Y.satBeforeTheophany) gospel = jdn - Y.nextPascha;
    else if (pdist > Y.lukanJumpThreshold) gospel = pdist + Y.lukanJump;
    else gospel = pdist;
  }
  const noMemorial = [-36, -29, -22].includes(pdist) && m === 3 && [9, 24, 25, 26].includes(d);

  let rows = READINGS.filter(r => {
    if (r.tradition !== 'greek' && r.tradition !== 'common') return false;
    if (gospel !== null && r.pdist === gospel && r.source === 'Gospel' && !(noMemorial && r.desc === 'Departed')) return true;
    if (epistle !== null && r.pdist === epistle && r.source === 'Epistle' && !(noMemorial && r.desc === 'Departed')) return true;
    // τις καθημερινές της Τεσσαρακοστής δεν τελείται Λειτουργία, παρά μόνο σε μεγάλες εορτές
    if (r.month === m && r.day === d && (!(pdist >= -48 && pdist <= -3 && wd >= MON && wd <= FRI) || feastLevel >= 3)) {
      if (m === 3 && d === 26 && [MON, TUE, THU].includes(wd) && r.desc === 'Theotokos') return false;
      return true;
    }
    if (floatIndex && r.pdist === floatIndex) return true;
    return false;
  });
  // άγιοι και κινητές μνήμες της ρωσικής/αμερικανικής τάξης, που δεν διαβάζονται στην ελληνική
  rows = rows.filter(r => !SLAVIC_FLOATS.has(r.pdist) && !(r.month && SLAVIC_SAINTS.has(r.desc + '@' + r.month + '/' + r.day)));
  rows.sort((a, b) => a.ordering - b.ordering || a.i - b.i);
  rows = preferTradition(rows);

  // Τα Ψυχοσάββατα της ελληνικής τάξης είναι δύο: πριν από την Απόκρεω και πριν από την Πεντηκοστή.
  // (Τα Σάββατα της Τεσσαρακοστής και το Σάββατο του αγίου Δημητρίου είναι σλαβική τάξη.)
  const souls = pdist === -57 || pdist === 48;
  rows = rows.filter(r => r.desc !== 'Departed' || (souls && r.source === 'Epistle'));

  const floats = rows.filter(r => r.pdist && r.pdist >= 1000);
  // του Μηναίου: για κάθε ανάγνωσμα προτιμάται η ελληνική τάξη, όπου υπάρχει
  const propersAll = rows.filter(r => r.month && !floats.includes(r));
  const propers = propersAll.filter(r => r.tradition === 'greek' || !propersAll.some(x => x.tradition === 'greek' && x.source === r.source));
  const ordinary = rows.filter(r => !floats.includes(r) && !r.month);
  const first = (list, src) => list.find(r => r.source === src) || null;

  // πόσο μεγάλη είναι η ημέρα του κύκλου του Πάσχα και πόσο η εορτή του Μηναίου
  const lv = list => list.length ? Math.max(...list.map(r => r.feast_level)) : 0;
  const paschalLevel = lv(days.filter(r => !r.month));
  const fixedLevel = lv(days.filter(r => r.month));
  const triodion = pdist >= -70 && pdist <= -1, pentecostarion = pdist >= 0 && pdist <= 56;
  // στην περίοδο του Πεντηκοσταρίου οι καθημερινές κρατούν τα αναγνώσματα του κύκλου, εκτός από μεγάλες εορτές
  const saintWins = propers.length > 0 && fixedLevel >= paschalLevel &&
    (!pentecostarion || fixedLevel >= 3 || propers.some(r => r.tradition === 'greek'));

  let E = null, G = null;
  if (wd !== SUN && first(floats, 'Epistle') && first(floats, 'Gospel')) { E = first(floats, 'Epistle'); G = first(floats, 'Gospel'); }
  else if (wd === SUN) {
    // Κυριακή: το Ευαγγέλιο της Κυριακής· ο Απόστολος του αγίου, αν υπάρχει,
    // εκτός από τις Κυριακές του Τριωδίου και του Πεντηκοσταρίου
    G = first(floats, 'Gospel') || first(ordinary, 'Gospel') || first(propers, 'Gospel');
    const se = propers.find(r => r.source === 'Epistle' && !/Forefeast/.test(r.desc) && (triodion ? r.tradition === 'greek' : sundaySaint(r)));
    const saintEpistle = se && !pentecostarion && fixedLevel >= paschalLevel ? se : null;
    E = saintEpistle || first(floats, 'Epistle') || first(ordinary, 'Epistle') || first(propers, 'Epistle');
  } else {
    // καθημερινή: ό,τι έχει ο άγιος της ημέρας· ό,τι δεν έχει, από τον κύκλο
    E = (saintWins && first(propers, 'Epistle')) || first(floats, 'Epistle') || first(ordinary, 'Epistle') || first(propers, 'Epistle');
    G = (saintWins && first(propers, 'Gospel')) || first(floats, 'Gospel') || first(ordinary, 'Gospel') || first(propers, 'Gospel');
  }
  const chosen = [E, G].filter(Boolean);

  return {
    pdist, weekday: wd, feastLevel,
    readings: chosen.map(r => ({ source: r.source, desc: r.desc, pericope: r.pericope })),
  };
}

module.exports = { dayInfo, pascha, dayNum, fromDayNum, PERICOPES: DATA.pericopes };

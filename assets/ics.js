// assets/ics.js — αρχεία ημερολογίου (iCalendar, RFC 5545) για το κινητό
// Χρησιμοποιείται στον browser (window.OrthoIcs, λήψη αρχείου χωρίς σύνδεση) και
// στον server (api/calendar.js, συνδρομή που ενημερώνεται μόνη της).
//
// Επιλογές του build():
//   from, to   Date        διάστημα ημερών (με τις δύο άκρες)
//   fast       'periods'   οι περίοδοι νηστείας και οι ξεχωριστές ημέρες νηστείας
//              'all'       κάθε ημέρα νηστείας χωριστά
//              'none'      καθόλου
//   eve        boolean     υπενθύμιση το προηγούμενο βράδυ στις 20:00
//   feasts     boolean     οι μεγάλες εορτές
//   prayer     ['07:00']   καθημερινή υπενθύμιση για την ευχή, στην τοπική ώρα της συσκευής
//   monastic   boolean     μοναχική τάξη
//   site       string      διεύθυνση του site για τους συνδέσμους
//   now        Date        για το DTSTAMP

(function (root) {
  'use strict';

  const C = (typeof module !== 'undefined' && module.exports) ? require('./calendar.js') : root.OrthoCal;

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const utcStamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  // Γραμμές έως 75 bytes· η συνέχεια ξεκινά με κενό. Δεν κόβουμε ποτέ μέσα σε χαρακτήρα UTF-8.
  function utf8len(ch) { const c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function fold(line) {
    let out = '', cur = '', len = 0;
    for (const ch of line) {
      const n = utf8len(ch);
      if (len + n > 75) { out += cur + '\r\n'; cur = ' '; len = 1; }
      cur += ch; len += n;
    }
    return out + cur;
  }

  function allDay(lines, o) {
    lines.push('BEGIN:VEVENT', 'UID:' + o.uid, 'DTSTAMP:' + o.stamp,
      'DTSTART;VALUE=DATE:' + ymd(o.start), 'DTEND;VALUE=DATE:' + ymd(C.addDays(o.end || o.start, 1)),
      'SUMMARY:' + esc(o.summary));
    if (o.desc) lines.push('DESCRIPTION:' + esc(o.desc));
    if (o.url) lines.push('URL:' + o.url);
    lines.push('TRANSP:TRANSPARENT');
    if (o.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(o.alarm), 'TRIGGER:-PT4H', 'END:VALARM');
    lines.push('END:VEVENT');
  }

  // Περίοδοι νηστείας και ξεχωριστές ημέρες ενός έτους
  function fastPeriods(y) {
    const p = C.periodsOf(y), e = p.easter;
    const out = [
      { key: 'lent', start: p.cleanMon, end: C.addDays(e, -1), name: 'Μεγάλη Τεσσαρακοστή και Μεγάλη Εβδομάδα' },
      { key: 'theophany-eve', start: new Date(y, 0, 5), name: 'Παραμονή των Θεοφανείων (νηστεία)' },
      { key: 'good-friday', start: p.goodFri, name: 'Μεγάλη Παρασκευή (ολική νηστεία)' },
      { key: 'dormition', start: new Date(y, 7, 1), end: new Date(y, 7, 14), name: 'Νηστεία της Θεοτόκου (Δεκαπενταύγουστος)' },
      { key: 'beheading', start: new Date(y, 7, 29), name: 'Αποτομή της Κεφαλής του Προδρόμου (νηστεία)' },
      { key: 'cross', start: new Date(y, 8, 14), name: 'Ύψωση του Τιμίου Σταυρού (νηστεία)' },
      { key: 'nativity', start: new Date(y, 10, 15), end: new Date(y, 11, 24), name: 'Νηστεία των Χριστουγέννων' },
    ];
    if (p.apostlesDays > 0) out.push({ key: 'apostles', start: p.apostlesStart, end: p.apostlesEnd, name: 'Νηστεία των Αγίων Αποστόλων' });
    return out;
  }

  function build(opts) {
    const o = Object.assign({ fast: 'periods', eve: true, feasts: true, prayer: [], monastic: false, site: '', now: new Date() }, opts || {});
    const stamp = utcStamp(o.now);
    const from = new Date(o.from.getFullYear(), o.from.getMonth(), o.from.getDate());
    const to = new Date(o.to.getFullYear(), o.to.getMonth(), o.to.getDate());
    const page = o.site ? o.site.replace(/\/$/, '') + '/main.html' : '';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OrthodoxNotebook//Nisteiodromio//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + esc(o.name || 'Νηστειοδρόμιο'),
      'X-WR-CALDESC:' + esc('Νηστείες και εορτές κατά την κοινή πράξη της Εκκλησίας της Ελλάδος, όπως τις κατέγραψε ένας απλός άνθρωπος. Μπορεί να έχουν λάθη· για τη νηστεία σας ρωτήστε τον πνευματικό σας.'),
      'X-WR-TIMEZONE:Europe/Athens', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
    ];

    if (o.fast === 'periods') {
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        for (const f of fastPeriods(y)) {
          const end = f.end || f.start;
          if (end < from || f.start > to) continue;
          const span = f.end ? ' (' + C.formatShort(f.start) + ' – ' + C.formatShort(f.end) + ')' : '';
          allDay(lines, {
            uid: 'fast-' + f.key + '-' + y + '@orthodoxnotebook', stamp, start: f.start, end: f.end,
            summary: f.name, desc: (f.end ? 'Από ' + C.formatShort(f.start) + ' έως ' + C.formatShort(f.end) + '. ' : '') +
              'Για το τι τρώμε κάθε ημέρα, δείτε το νηστειοδρόμιο.' + (page ? '\n' + page : ''),
            url: page, alarm: o.eve ? 'Αύριο: ' + f.name + span : '',
          });
        }
      }
    } else if (o.fast === 'all') {
      for (let d = new Date(from); d <= to; d = C.addDays(d, 1)) {
        const f = C.fasting(d, { monastic: o.monastic });
        if (f.level === 'none') continue;
        allDay(lines, {
          uid: 'fast-' + ymd(d) + '@orthodoxnotebook', stamp, start: d,
          summary: f.label, desc: [f.period, f.desc, f.note].filter(Boolean).join('\n') + (page ? '\n' + page : ''),
          url: page, alarm: o.eve ? 'Αύριο: ' + f.label + (f.period ? ' · ' + f.period : '') : '',
        });
      }
    }

    if (o.feasts) {
      for (let d = new Date(from); d <= to; d = C.addDays(d, 1)) {
        const big = C.feastsOf(d).filter(x => x.rank === 'great' || x.rank === 'major');
        if (!big.length) continue;
        allDay(lines, { uid: 'feast-' + ymd(d) + '@orthodoxnotebook', stamp, start: d, summary: big.map(x => x.name).join(' · ') });
      }
    }

    // Καθημερινή υπενθύμιση για την ευχή, σε «ελεύθερη» τοπική ώρα (όποια ζώνη ώρας κι αν έχει η συσκευή)
    for (const t of o.prayer || []) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m || +m[1] > 23 || +m[2] > 59) continue;
      const hhmm = pad(+m[1]) + pad(+m[2]);
      lines.push('BEGIN:VEVENT', 'UID:prayer-' + hhmm + '@orthodoxnotebook', 'DTSTAMP:' + stamp,
        'DTSTART:20250101T' + hhmm + '00', 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
        'SUMMARY:' + esc('Ώρα για την ευχή'),
        'DESCRIPTION:' + esc('Κύριε Ἰησοῦ Χριστέ, ἐλέησόν με.\nΠάρτε το κομποσκοίνι σας και αφήστε την οθόνη.'),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Ώρα για την ευχή · Κύριε Ἰησοῦ Χριστέ, ἐλέησόν με'), 'TRIGGER:PT0M', 'END:VALARM',
        'END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  const OrthoIcs = { build, fold };
  if (typeof module !== 'undefined' && module.exports) module.exports = OrthoIcs;
  else root.OrthoIcs = OrthoIcs;
})(typeof window !== 'undefined' ? window : globalThis);

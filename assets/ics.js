// assets/ics.js — αρχεία ημερολογίου (iCalendar, RFC 5545) για το κινητό
// Χρησιμοποιείται στον browser (window.OrthoIcs: λήψη αρχείου, δοκιμή, «επόμενες ειδοποιήσεις»)
// και στον server (api/calendar.js: συνδρομή που ενημερώνεται μόνη της).
//
// Οι ειδοποιήσεις τις δίνει η εφαρμογή Ημερολόγιο του κινητού, όχι η σελίδα.
//
// Επιλογές (κάθε ώρα είναι 'HH:MM' ή κενό για «χωρίς ειδοποίηση»):
//   from, to        Date      διάστημα ημερών (με τις δύο άκρες)
//   fast            'periods' | 'all' | 'none'
//   eve             ώρα       ειδοποίηση το προηγούμενο βράδυ για τη νηστεία
//   monastic        boolean
//   feasts          boolean   οι μεγάλες εορτές
//   feastsEve       ώρα       ειδοποίηση το προηγούμενο βράδυ για τις μεγάλες εορτές
//   names           boolean   οι εορτάζοντες κάθε ημέρας · namesAt: ώρα ειδοποίησης την ίδια ημέρα
//   readings        boolean   τα αναγνώσματα κάθε ημέρας · readingsAt: ώρα · readingsOf(date) → κείμενο ή null
//   morning, evening ώρα       πρωινές και βραδινές προσευχές (κάθε ημέρα)
//   prayer          ['07:00']  η ευχή (κάθε ημέρα)
//   liturgy         ώρα       το Σάββατο, για τη Θεία Λειτουργία της Κυριακής
//   site, now, name

(function (root) {
  'use strict';

  const C = (typeof module !== 'undefined' && module.exports) ? require('./calendar.js') : root.OrthoCal;

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const utcStamp = d => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function hm(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m && +m[1] < 24 && +m[2] < 60 ? [+m[1], +m[2]] : null; }

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

  // Ειδοποίηση για γεγονός ολόκληρης ημέρας, σε λεπτά από τα μεσάνυχτα της ημέρας:
  // «το προηγούμενο βράδυ στις 20:00» = −240, «την ίδια ημέρα στις 09:00» = 540
  const eveOffset = t => { const x = hm(t); return x ? -(24 * 60 - (x[0] * 60 + x[1])) : null; };
  const dayOffset = t => { const x = hm(t); return x ? x[0] * 60 + x[1] : null; };

  const DAILY = {
    morning: { title: 'Πρωινή προσευχή', desc: 'Οι πρωινές προσευχές.', page: 'proseuxitario.html#proi' },
    evening: { title: 'Βραδινή προσευχή', desc: 'Οι βραδινές προσευχές πριν από τον ύπνο.', page: 'proseuxitario.html#vrady' },
    prayer: { title: 'Ώρα για την ευχή', desc: 'Κύριε Ἰησοῦ Χριστέ, ἐλέησόν με.\nΠάρτε το κομποσκοίνι σας και αφήστε την οθόνη.', page: '' },
  };

  // Όλα τα γεγονότα, ως αντικείμενα (κοινά για το αρχείο και για τη λίστα «επόμενες ειδοποιήσεις»)
  function collect(opts) {
    const o = Object.assign({ fast: 'periods', eve: '20:00', feasts: true, prayer: [], site: '' }, opts || {});
    const from = new Date(o.from.getFullYear(), o.from.getMonth(), o.from.getDate());
    const to = new Date(o.to.getFullYear(), o.to.getMonth(), o.to.getDate());
    const base = o.site ? o.site.replace(/\/$/, '') + '/' : '';
    const ev = [];
    const eve = eveOffset(o.eve);

    if (o.fast === 'periods') {
      for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        for (const f of fastPeriods(y)) {
          const end = f.end || f.start;
          if (end < from || f.start > to) continue;
          const span = f.end ? ' (' + C.formatShort(f.start) + ' – ' + C.formatShort(f.end) + ')' : '';
          ev.push({ uid: 'fast-' + f.key + '-' + y, day: f.start, end: f.end, summary: f.name,
            desc: (f.end ? 'Από ' + C.formatShort(f.start) + ' έως ' + C.formatShort(f.end) + '. ' : '') + 'Για το τι τρώμε κάθε ημέρα, δείτε το νηστειοδρόμιο.',
            url: base && base + 'main.html', alarm: eve, alarmText: 'Αύριο: ' + f.name + span });
        }
      }
    } else if (o.fast === 'all') {
      for (let d = new Date(from); d <= to; d = C.addDays(d, 1)) {
        const f = C.fasting(d, { monastic: o.monastic });
        if (f.level === 'none') continue;
        ev.push({ uid: 'fast-' + ymd(d), day: d, summary: f.label, desc: [f.period, f.desc, f.note].filter(Boolean).join('\n'),
          url: base && base + 'main.html', alarm: eve, alarmText: 'Αύριο: ' + f.label + (f.period ? ' · ' + f.period : '') });
      }
    }

    const feastEve = eveOffset(o.feastsEve);
    const namesAt = dayOffset(o.namesAt), readingsAt = dayOffset(o.readingsAt);
    for (let d = new Date(from); d <= to; d = C.addDays(d, 1)) {
      if (o.feasts) {
        const big = C.feastsOf(d).filter(x => x.rank === 'great' || x.rank === 'major');
        if (big.length) ev.push({ uid: 'feast-' + ymd(d), day: d, summary: big.map(x => x.name).join(' · '),
          url: base && base + 'synaxarion.html', alarm: feastEve, alarmText: 'Αύριο: ' + big.map(x => x.name).join(' · ') });
      }
      if (o.names) {
        const n = C.namedaysOf(d);
        if (n.length) ev.push({ uid: 'names-' + ymd(d), day: d, summary: 'Εορτάζουν: ' + n.join(', '),
          url: base && base + 'synaxarion.html', alarm: namesAt, alarmText: 'Σήμερα εορτάζουν: ' + n.join(', ') });
      }
      if (o.readings && o.readingsOf) {
        const r = o.readingsOf(d);
        if (r) ev.push({ uid: 'readings-' + ymd(d), day: d, summary: 'Αναγνώσματα: ' + r,
          url: base && base + 'anagnosmata.html?d=' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
          alarm: readingsAt, alarmText: 'Τα αναγνώσματα της ημέρας: ' + r });
      }
    }

    // καθημερινές υπενθυμίσεις, σε «ελεύθερη» τοπική ώρα (όποια ζώνη ώρας κι αν έχει η συσκευή)
    const daily = (key, t, info) => {
      const x = hm(t); if (!x) return;
      ev.push({ uid: key + '-' + pad(x[0]) + pad(x[1]), time: x, rrule: 'FREQ=DAILY', summary: info.title,
        desc: info.desc, url: base && info.page ? base + info.page : '', alarm: 0, alarmText: info.title });
    };
    daily('morning', o.morning, DAILY.morning);
    daily('evening', o.evening, DAILY.evening);
    for (const t of o.prayer || []) daily('prayer', t, DAILY.prayer);
    const lit = hm(o.liturgy);
    if (lit) ev.push({ uid: 'liturgy-' + pad(lit[0]) + pad(lit[1]), time: lit, rrule: 'FREQ=WEEKLY;BYDAY=SA', summary: 'Αύριο Κυριακή: Θεία Λειτουργία',
      desc: 'Ετοιμαστείτε για τη Θεία Λειτουργία της Κυριακής.', url: base && base + 'anagnosmata.html', alarm: 0, alarmText: 'Αύριο Κυριακή: Θεία Λειτουργία' });
    return ev;
  }

  function build(opts) {
    const o = Object.assign({ now: new Date() }, opts || {});
    const stamp = utcStamp(o.now);
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OrthodoxNotebook//Nisteiodromio//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:' + esc(o.name || 'Ορθόδοξο Σημειωματάριο'),
      'X-WR-CALDESC:' + esc('Νηστείες, εορτές και υπενθυμίσεις κατά την κοινή πράξη της Εκκλησίας της Ελλάδος, από τις σημειώσεις ενός λαϊκού. Μπορεί να έχουν λάθη· για τη νηστεία σας ρωτήστε τον πνευματικό σας.'),
      'X-WR-TIMEZONE:Europe/Athens', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H',
    ];
    for (const e of collect(o)) {
      lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@orthodoxnotebook', 'DTSTAMP:' + stamp);
      if (e.time) {
        lines.push('DTSTART:20250101T' + pad(e.time[0]) + pad(e.time[1]) + '00', 'DURATION:PT10M', 'RRULE:' + e.rrule);
        // η επανάληψη ξεκινά από Σάββατο για την εβδομαδιαία
        if (/WEEKLY/.test(e.rrule)) lines[lines.length - 3] = 'DTSTART:20250104T' + pad(e.time[0]) + pad(e.time[1]) + '00';
      } else {
        lines.push('DTSTART;VALUE=DATE:' + ymd(e.day), 'DTEND;VALUE=DATE:' + ymd(C.addDays(e.end || e.day, 1)));
      }
      lines.push('SUMMARY:' + esc(e.summary));
      const desc = [e.desc, e.url].filter(Boolean).join('\n');
      if (desc) lines.push('DESCRIPTION:' + esc(desc));
      if (e.url) lines.push('URL:' + e.url);
      lines.push('TRANSP:TRANSPARENT');
      if (e.alarm !== null && e.alarm !== undefined) {
        const a = e.alarm, sign = a < 0 ? '-' : '', m = Math.abs(a);
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.alarmText || e.summary),
          'TRIGGER:' + sign + 'PT' + (Math.floor(m / 60) ? Math.floor(m / 60) + 'H' : '') + (m % 60 || !Math.floor(m / 60) ? (m % 60) + 'M' : ''), 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // Οι επόμενες ειδοποιήσεις, με την ώρα που θα χτυπήσουν (για έλεγχο στη σελίδα)
  function upcoming(opts, count) {
    const now = opts.now || new Date();
    const out = [];
    for (const e of collect(opts)) {
      if (e.alarm === null || e.alarm === undefined) continue;
      if (e.time) {
        for (let k = 0; k < 8; k++) {
          const d = C.addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), k);
          if (/WEEKLY/.test(e.rrule) && d.getDay() !== 6) continue;
          const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.time[0], e.time[1]);
          if (at > now) out.push({ at, text: e.alarmText });
        }
      } else {
        const at = new Date(e.day.getFullYear(), e.day.getMonth(), e.day.getDate(), 0, e.alarm);
        if (at > now) out.push({ at, text: e.alarmText });
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, count || 8);
  }

  // Δοκιμή: ένα γεγονός λίγο μετά από τώρα, με ειδοποίηση τη στιγμή που αρχίζει
  function test(now, minutes) {
    const at = new Date(now.getTime() + (minutes || 1) * 60000);
    at.setSeconds(0, 0);
    if (at - now < 55000) at.setMinutes(at.getMinutes() + 1);   // τουλάχιστον ένα λεπτό για την «Προσθήκη»
    const end = new Date(at.getTime() + 5 * 60000);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OrthodoxNotebook//Test//EL', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:test-' + now.getTime() + '@orthodoxnotebook', 'DTSTAMP:' + utcStamp(now),
      'DTSTART:' + utcStamp(at), 'DTEND:' + utcStamp(end), 'SUMMARY:' + esc('Δοκιμή υπενθύμισης · Ορθόδοξο Σημειωματάριο'),
      'DESCRIPTION:' + esc('Αν είδατε αυτή την ειδοποίηση, οι υπενθυμίσεις δουλεύουν. Μπορείτε να σβήσετε το γεγονός.'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Δοκιμή υπενθύμισης: δουλεύει'), 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'];
    return { ics: lines.map(fold).join('\r\n') + '\r\n', at };
  }

  // Συνάρτηση αναγνωσμάτων από τα αρχεία readings/ (έτη → { 'MM-DD': [[περικοπή, 'A'|'E']] }, refs → { περικοπή: παραπομπή })
  function readingsLookup(years, refs) {
    return d => {
      const y = years[d.getFullYear()];
      const list = y && y[pad(d.getMonth() + 1) + '-' + pad(d.getDate())];
      if (!list || !list.length) return null;
      return list.map(([pid, k]) => (k === 'A' ? 'Απ. ' : 'Ευ. ') + (refs[pid] || '')).join(' · ');
    };
  }

  const OrthoIcs = { build, upcoming, test, readingsLookup, fold, hm };
  if (typeof module !== 'undefined' && module.exports) module.exports = OrthoIcs;
  else root.OrthoIcs = OrthoIcs;
})(typeof window !== 'undefined' ? window : globalThis);

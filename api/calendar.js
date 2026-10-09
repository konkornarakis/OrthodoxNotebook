// api/calendar.js — ημερολόγιο για συνδρομή από το κινητό (webcal) ή για λήψη
// GET /api/calendar?fast=periods|all|none&eve=1&feasts=1&prayer=07:00,21:00&monastic=0[&download=1]
//
// Η εφαρμογή ημερολογίου του κινητού το ξαναδιαβάζει μόνη της, οπότε οι νηστείες
// και οι εορτές ενημερώνονται κάθε χρόνο χωρίς να ανοίξει κανείς το site.

'use strict';

const OrthoIcs = require('../assets/ics.js');

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams;
  const fast = ['periods', 'all', 'none'].includes(q.get('fast')) ? q.get('fast') : 'periods';
  const prayer = (q.get('prayer') || '').split(',').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}$/.test(s)).slice(0, 4);
  const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  const proto = (req.headers && req.headers['x-forwarded-proto']) || 'https';
  const now = new Date();
  // σε ώρα Ελλάδος δεν χρειάζεται ακρίβεια λεπτού· αρκεί η σωστή ημέρα
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 400);

  const body = OrthoIcs.build({
    from, to, fast,
    eve: q.get('eve') !== '0',
    feasts: q.get('feasts') !== '0',
    prayer,
    monastic: q.get('monastic') === '1',
    site: host ? proto + '://' + host : '',
    now,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', (q.get('download') === '1' ? 'attachment' : 'inline') + '; filename="nisteiodromio.ics"');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200');
  res.end(body);
}

module.exports = handler;

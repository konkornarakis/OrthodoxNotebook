// api/calendar.js — ημερολόγιο για συνδρομή από το κινητό (webcal) ή για λήψη
// GET /api/calendar?fast=periods|all|none&eve=20:00&monastic=0&feasts=1&feve=20:00&names=09:00
//                  &readings=08:00&morning=07:00&prayer=13:00,21:00&evening=22:00&liturgy=21:00[&download=1]
// Κάθε ώρα: 'HH:MM' για ειδοποίηση, '1' για γεγονός χωρίς ειδοποίηση, '0' ή απουσία για τίποτα.
//
// Η εφαρμογή ημερολογίου του κινητού το ξαναδιαβάζει μόνη της, οπότε οι νηστείες, οι εορτές
// και τα αναγνώσματα ενημερώνονται χωρίς να ανοίξει κανείς το site.

'use strict';

const fs = require('fs');
const path = require('path');
const OrthoIcs = require('../assets/ics.js');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'readings', file), 'utf8')); } catch (e) { return null; }
}

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams;
  const time = k => { const v = (q.get(k) || '').trim(); return /^\d{1,2}:\d{2}$/.test(v) ? v : ''; };
  const on = k => { const v = q.get(k); return v !== null && v !== '0' && v !== ''; };
  const fast = ['periods', 'all', 'none'].includes(q.get('fast')) ? q.get('fast') : 'periods';
  const prayer = (q.get('prayer') || '').split(',').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}$/.test(s)).slice(0, 4);
  // παλιές διευθύνσεις: eve=1 σήμαινε 20:00
  const eve = q.get('eve') === null || q.get('eve') === '1' ? '20:00' : time('eve');
  const host = req.headers && (req.headers['x-forwarded-host'] || req.headers.host);
  const proto = (req.headers && req.headers['x-forwarded-proto']) || 'https';
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 400);

  let readingsOf = null;
  if (on('readings')) {
    const years = {};
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) years[y] = readJson(y + '.json');
    readingsOf = OrthoIcs.readingsLookup(years, readJson('refs.json') || {});
  }

  const body = OrthoIcs.build({
    from, to, fast, eve,
    monastic: q.get('monastic') === '1',
    feasts: q.get('feasts') !== '0', feastsEve: time('feve'),
    names: on('names'), namesAt: time('names'),
    readings: !!readingsOf, readingsAt: time('readings'), readingsOf,
    morning: time('morning'), evening: time('evening'), prayer, liturgy: time('liturgy'),
    site: host ? proto + '://' + host : '',
    now,
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', (q.get('download') === '1' ? 'attachment' : 'inline') + '; filename="orthodoxo-simeiomatario.ics"');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=43200');
  res.end(body);
}

module.exports = handler;

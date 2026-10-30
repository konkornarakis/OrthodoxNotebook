// dev-server.js  —  local development server
// Serves static files AND exposes /api/* endpoints for content creation.
// Run:  node dev-server.js   (or: npm run dev)
// On Vercel the build step runs generate-data.js instead; this file is never executed.

'use strict';
const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');
const saintsHandler = require('./api/saints.js');
const calendarHandler = require('./api/calendar.js');
const adminHandler = require('./api/admin.js');
const recordingsHandler = require('./api/recordings.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ics':  'text/calendar; charset=utf-8',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  c => chunks.push(c));
    req.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

// Strip characters that are invalid in Windows/Linux/macOS folder names
function sanitizeName(s) {
  return String(s || '')
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Request handler ───────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // Allow local cross-origin fetches (Five Server opens on a different port)
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  // ── GET /api/saints?m=&d=  →  saints of the day (same handler as on Vercel) ── //
  if (url === '/api/saints' && req.method === 'GET') {
    await saintsHandler(req, res);
    return;
  }

  // ── GET /api/calendar  →  ημερολόγιο .ics για συνδρομή ή λήψη (όπως στο Vercel) ── //
  if (url === '/api/calendar' && req.method === 'GET') {
    calendarHandler(req, res);
    return;
  }

  // ── GET /api/recordings  →  ηχογραφήσεις Πειραϊκής Εκκλησίας (όπως στο Vercel) ── //
  if (url === '/api/recordings' && req.method === 'GET') { await recordingsHandler(req, res); return; }

  // ── POST /api/admin  →  διαχείριση ομιλιών μέσω GitHub (όπως στο Vercel) ── //
  if (url === '/api/admin') { adminHandler(req, res); return; }

  // ── GET /api/local  →  signals the page it's running on the dev server ── //
  if (url === '/api/local' && req.method === 'GET') {
    json(res, { local: true });
    return;
  }

  // ── POST /api/create-sermon  →  create folder + files + regenerate ─────── //
  if (url === '/api/create-sermon' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { json(res, { ok: false, error: 'Invalid JSON body' }, 400); return; }

    const { title, speaker, sourceUrl, date, tags, summary, transcript } = body;

    if (!title || !sanitizeName(title)) {
      json(res, { ok: false, error: 'Ο τίτλος είναι υποχρεωτικός.' }, 400);
      return;
    }

    const safeTitle   = sanitizeName(title);
    const safeSpeaker = sanitizeName(speaker || '');
    const folderName  = safeSpeaker ? `${safeTitle} - ${safeSpeaker}` : safeTitle;
    const folderPath  = path.join(ROOT, 'sermons', folderName);

    if (fs.existsSync(folderPath)) {
      json(res, { ok: false, error: `Υπάρχει ήδη φάκελος με αυτό το όνομα: "${folderName}"` }, 409);
      return;
    }

    try {
      fs.mkdirSync(folderPath, { recursive: true });

      // _Details.txt — key: value pairs, only non-empty fields
      const detailLines = [];
      if (sourceUrl && sourceUrl.trim()) detailLines.push(`url: ${sourceUrl.trim()}`);
      if (date      && date.trim())      detailLines.push(`date: ${date.trim()}`);
      if (tags      && tags.trim())      detailLines.push(`tags: ${tags.trim()}`);
      fs.writeFileSync(path.join(folderPath, '_Details.txt'),  detailLines.join('\n'), 'utf8');

      // _Summary.txt
      fs.writeFileSync(path.join(folderPath, '_Summary.txt'), summary || '', 'utf8');

      // _Transcript.txt — named after the folder (generate-data.js finds it by suffix)
      const tsFileName = `${folderName}_Transcript.txt`;
      fs.writeFileSync(path.join(folderPath, tsFileName), transcript || '', 'utf8');

      // Regenerate sermons-data.json
      execSync('node generate-data.js', { cwd: ROOT, stdio: 'inherit' });

      json(res, { ok: true, folder: folderName });
    } catch (err) {
      // Clean up partial folder on error
      try { fs.rmSync(folderPath, { recursive: true, force: true }); } catch {}
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── PUT /api/edit-sermon  →  rename folder + update files + regenerate ─── //
  if (url === '/api/edit-sermon' && req.method === 'PUT') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { json(res, { ok: false, error: 'Invalid JSON body' }, 400); return; }

    const { id, title, speaker, sourceUrl, date, tags, summary, transcript } = body;

    if (!title || !sanitizeName(title)) {
      json(res, { ok: false, error: 'Ο τίτλος είναι υποχρεωτικός.' }, 400);
      return;
    }

    const oldFolderPath = path.join(ROOT, 'sermons', id);
    if (!fs.existsSync(oldFolderPath)) {
      json(res, { ok: false, error: `Δεν βρέθηκε ο φάκελος: "${id}"` }, 404);
      return;
    }

    const safeTitle     = sanitizeName(title);
    const safeSpeaker   = sanitizeName(speaker || '');
    const newFolder     = safeSpeaker ? `${safeTitle} - ${safeSpeaker}` : safeTitle;
    const newFolderPath = path.join(ROOT, 'sermons', newFolder);

    // Security: block path traversal
    const sermonsDir = path.join(ROOT, 'sermons');
    if (!oldFolderPath.startsWith(sermonsDir + path.sep) ||
        !newFolderPath.startsWith(sermonsDir + path.sep)) {
      json(res, { ok: false, error: 'Forbidden' }, 403); return;
    }

    try {
      if (newFolder !== id) {
        if (fs.existsSync(newFolderPath)) {
          json(res, { ok: false, error: `Υπάρχει ήδη φάκελος με αυτό το όνομα: "${newFolder}"` }, 409);
          return;
        }
        fs.renameSync(oldFolderPath, newFolderPath);
      }

      const detailLines = [];
      if (sourceUrl && sourceUrl.trim()) detailLines.push(`url: ${sourceUrl.trim()}`);
      if (date      && date.trim())      detailLines.push(`date: ${date.trim()}`);
      if (tags      && tags.trim())      detailLines.push(`tags: ${tags.trim()}`);
      fs.writeFileSync(path.join(newFolderPath, '_Details.txt'), detailLines.join('\n'), 'utf8');
      fs.writeFileSync(path.join(newFolderPath, '_Summary.txt'), summary || '', 'utf8');

      // Find and update transcript file (match by suffix, don't hardcode old name)
      const filesInFolder = fs.readdirSync(newFolderPath);
      const existingTs    = filesInFolder.find(f => f !== '_Transcript.txt' && f.endsWith('_Transcript.txt'));
      const newTsName     = `${newFolder}_Transcript.txt`;
      const newTsPath     = path.join(newFolderPath, newTsName);
      if (existingTs) {
        const existingTsPath = path.join(newFolderPath, existingTs);
        if (existingTsPath !== newTsPath) fs.renameSync(existingTsPath, newTsPath);
      }
      fs.writeFileSync(newTsPath, transcript || '', 'utf8');

      execSync('node generate-data.js', { cwd: ROOT, stdio: 'inherit' });
      json(res, { ok: true, folder: newFolder });
    } catch (err) {
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── DELETE /api/delete-sermon  →  remove folder + regenerate ─────────── //
  if (url === '/api/delete-sermon' && req.method === 'DELETE') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { json(res, { ok: false, error: 'Invalid JSON body' }, 400); return; }

    const { id } = body;
    const folderPath = path.join(ROOT, 'sermons', id);

    const sermonsDir = path.join(ROOT, 'sermons');
    if (!folderPath.startsWith(sermonsDir + path.sep)) {
      json(res, { ok: false, error: 'Forbidden' }, 403); return;
    }
    if (!fs.existsSync(folderPath)) {
      json(res, { ok: false, error: `Δεν βρέθηκε ο φάκελος: "${id}"` }, 404);
      return;
    }

    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
      execSync('node generate-data.js', { cwd: ROOT, stdio: 'inherit' });
      json(res, { ok: true });
    } catch (err) {
      json(res, { ok: false, error: err.message }, 500);
    }
    return;
  }

  // ── Static file serving ──────────────────────────────────────────────────── //
  let filePath = path.join(ROOT, url === '/' ? 'main.html' : url);

  // Security: block path traversal
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // If a directory is requested, try index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  serveStatic(res, filePath);
});

function startServer(port) {
  server.listen(port, '127.0.0.1', () => {
    console.log('\n\u2629  Orthodox Helper \u2014 Dev Server');
    console.log(`   http://localhost:${port}/main.html`);
    console.log(`   http://localhost:${port}/sermons.html`);
    console.log('\n   Ctrl+C to stop\n');
  });
}

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n\u274C  Port ${server._port || PORT} is already in use.`);
    console.error(`   Another dev server is probably still running.`);
    console.error(`   Kill it first:\n`);
    console.error(`     Get-Process node | Stop-Process -Force   (PowerShell)`);
    console.error(`     taskkill /F /IM node.exe                 (CMD)\n`);
    process.exit(1);
  } else {
    throw e;
  }
});

server._port = +PORT;
startServer(+PORT);

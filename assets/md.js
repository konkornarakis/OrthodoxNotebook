// assets/md.js — μικρός και ασφαλής μετατροπέας Markdown σε HTML (για τα κείμενα των ομιλιών)
// Υποστηρίζει: επικεφαλίδες, παραγράφους, **έντονα**, *πλάγια*, [συνδέσμους](https://…), λίστες,
// πίνακες, παραθέματα (>) και οριζόντιες γραμμές. Όλο το κείμενο περνά πρώτα από escape.
// opts.time(html) → μετατρέπει τις χρονοσημάνσεις μέσα στο κείμενο (π.χ. σε συνδέσμους).
(function (root) {
  'use strict';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(text, opts) {
    let s = esc(text);
    const links = [];
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => {
      links.push(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
      return '\u0000' + (links.length - 1) + '\u0000';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, '$1<em>$2</em>')
      .replace(/(^|\s)_([^_\n]+)_(?=\s|[.,;:·!?)]|$)/g, '$1<em>$2</em>');
    if (opts && opts.time) s = opts.time(s);
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => links[+i]);
  }

  function table(rows, opts) {
    const cells = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    return '<div class="md-table"><table><thead><tr>' + head.map(h => `<th>${inline(h, opts)}</th>`).join('') + '</tr></thead><tbody>' +
      body.map(r => '<tr>' + r.map((c, i) => `<td data-label="${esc(head[i] || '')}">${inline(c, opts)}</td>`).join('') + '</tr>').join('') +
      '</tbody></table></div>';
  }

  function render(md, opts) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) {
        const n = Math.min(6, m[1].length + ((opts && opts.shift) || 0));
        out.push(`<h${n}${opts && opts.headingAttrs ? opts.headingAttrs(m[2], m[1].length) : ''}>${inline(m[2], opts)}</h${n}>`); i++; continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
        out.push(table(rows, opts)); continue;
      }
      if (/^\s*>/.test(line)) {
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + render(q.join('\n'), opts) + '</blockquote>'); continue;
      }
      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          let t = lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, '');
          while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) && /^\s{2,}/.test(lines[i])) t += ' ' + lines[i++].trim();
          items.push(`<li>${inline(t.replace(/^\[[ xX]\]\s*/, ''), opts)}</li>`);
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
      }
      const p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*\||\s*([-*+]|\d+\.)\s+)/.test(lines[i])) p.push(lines[i++].trim());
      out.push(`<p>${inline(p.join(' '), opts)}</p>`);
    }
    return out.join('\n');
  }

  // Χωρίζει ένα έγγραφο στις ενότητες «## …» (με τον τίτλο του # στην αρχή)
  function sections(md) {
    const out = { title: '', intro: '', parts: [] };
    let cur = null;
    for (const line of String(md || '').replace(/\r\n/g, '\n').split('\n')) {
      let m;
      if (!out.title && (m = /^#\s+(.*)$/.exec(line))) { out.title = m[1].trim(); continue; }
      if ((m = /^##\s+(.*)$/.exec(line))) { cur = { title: m[1].trim(), md: '' }; out.parts.push(cur); continue; }
      if (cur) cur.md += line + '\n'; else out.intro += line + '\n';
    }
    return out;
  }

  const OrthoMd = { render, sections, inline, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = OrthoMd;
  else root.OrthoMd = OrthoMd;
})(typeof window !== 'undefined' ? window : globalThis);

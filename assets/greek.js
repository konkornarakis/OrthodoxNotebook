// assets/greek.js — από το πολυτονικό στο μονοτονικό
// Για τα λειτουργικά κείμενα (προσευχές, αναγνώσματα), που είναι γραμμένα πολυτονικά.
(function (root) {
  'use strict';

  const ACCENTS = /[̀́͂]/g;            // βαρεία, οξεία, περισπωμένη
  const DROP = /[̓̔̓ͅ]/g;          // ψιλή, δασεία, υπογεγραμμένη, κορωνίδα
  const VOWELS = 'αεηιουω';
  const DIPH = ['αι', 'ει', 'οι', 'ου', 'υι', 'αυ', 'ευ', 'ηυ'];
  const KEEP = new Set(['ή', 'πού', 'πώς']);           // μονοσύλλαβα που κρατούν τόνο

  function syllables(bare) {
    // πόσες ομάδες φωνηέντων έχει η λέξη (χωρίς τόνους)
    let n = 0;
    for (let i = 0; i < bare.length; i++) {
      if (!VOWELS.includes(bare[i])) continue;
      n++;
      if (i + 1 < bare.length && DIPH.includes(bare[i] + bare[i + 1]) && !/[̈]/.test(bare[i + 1])) i++;
    }
    return n;
  }

  function word(w) {
    let d = w.normalize('NFD').replace(DROP, '');
    // κάθε τόνος γίνεται οξεία· αν η λέξη έχει δύο (π.χ. «ὄνομά σου»), μένουν και οι δύο, όπως και στο μονοτονικό
    d = d.replace(ACCENTS, '́');
    const bare = d.replace(/[̀-ͯ]/g, '').toLowerCase();
    let out = d.normalize('NFC');
    if (syllables(bare) <= 1 && !KEEP.has(out.toLowerCase())) out = d.replace(/́/g, '').normalize('NFC');
    return out;
  }

  function mono(text) {
    return String(text).replace(/[\p{L}̀-ͯ]+/gu, word).replace(/[᾿’]/g, '’');
  }

  const OrthoGreek = { mono };
  if (typeof module !== 'undefined' && module.exports) module.exports = OrthoGreek;
  else root.OrthoGreek = OrthoGreek;
})(typeof window !== 'undefined' ? window : globalThis);

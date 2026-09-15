#!/usr/bin/env node
/**
 * apply-covers.js — copy the user's album JPEGs into assets/art/ with
 * stable names. build-catalog.js then assigns them per-track.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'taylor swift album cover picture ');
const ART = path.join(ROOT, 'assets', 'art');

fs.mkdirSync(ART, { recursive: true });

const files = fs.existsSync(SRC) ? fs.readdirSync(SRC) : [];
function find(re) {
  return files.find(f => re.test(f) && /\.jpe?g$/i.test(f) && !f.includes('#'));
}

const copies = [
  { dest: 'tloas.jpg', match: /life of a showgirl cover/i },
  { dest: '1989.jpg', match: /1989/i },
  { dest: 'midnights.jpg', match: /midnights/i },
  { dest: 'red.jpg', match: /^red\b/i },
  { dest: 'evermore.jpg', match: /evermore/i },
  { dest: 'fearless.jpg', match: /fearless/i },
  { dest: 'reputation.jpg', match: /reputation/i },
  { dest: 'speak-now.jpg', match: /speak now/i },
  { dest: 'lover.jpg', match: /^_\.jpeg$/i },
  { dest: 'folklore.jpg', match: /^_ \(1\)\.jpeg$/i },
  { dest: 'debut.jpg', match: /^_ \(2\)\.jpeg$/i }
];

for (const c of copies) {
  const srcName = find(c.match);
  if (!srcName) {
    console.warn('missing cover for', c.dest);
    continue;
  }
  fs.copyFileSync(path.join(SRC, srcName), path.join(ART, c.dest));
  console.log('copied', srcName, '->', c.dest);
}

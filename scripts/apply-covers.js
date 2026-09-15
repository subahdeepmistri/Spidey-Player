#!/usr/bin/env node
/**
 * apply-covers.js — copy the user's album JPEGs into assets/art/ with
 * stable names and point catalog.json at them.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'taylor swift album cover picture ');
const ART = path.join(ROOT, 'assets', 'art');
const CATALOG = path.join(ROOT, 'assets', 'catalog.json');

fs.mkdirSync(ART, { recursive: true });

const files = fs.existsSync(SRC) ? fs.readdirSync(SRC) : [];
function find(re) {
  // Skip meme/hashtag dumps — they contain every album name in one filename.
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
  { dest: 'speak-now.jpg', match: /speak now/i }
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

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const artFor = {
  'The Life Of A Showgirl': 'assets/art/tloas.jpg',
  'Essentials, Vol. 1': 'assets/art/1989.jpg',
  'Essentials, Vol. 2': 'assets/art/evermore.jpg',
  'Taylor Swift Collection': 'assets/art/reputation.jpg'
};
let n = 0;
for (const t of catalog.tracks) {
  const art = artFor[t.album];
  if (art && fs.existsSync(path.join(ROOT, art))) {
    t.art = art;
    n++;
  }
}
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
console.log('updated art on', n, 'tracks');

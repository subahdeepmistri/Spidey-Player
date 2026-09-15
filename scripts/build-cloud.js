#!/usr/bin/env node
/**
 * build-cloud.js — staging dir for Vercel (Hobby ~100 MB cap).
 * Local assets/music/ stays the full 177-track library.
 * The cloud pack is 24 Essentials tracks at 96 kbps plus the app shell.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.cloud');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'catalog.json'), 'utf8'));
const LIMIT = 24;

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function mkdir(p) { fs.mkdirSync(p, { recursive: true }); }
function copyFile(src, dest) {
  mkdir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  mkdir(dest);
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else copyFile(from, to);
  }
}

rmrf(OUT);
mkdir(OUT);

const SHELL = [
  'index.html', 'app.js', 'db.js', 'id3.js', 'sw.js', 'style.css',
  'manifest.json', 'vercel.json', 'package.json'
];
for (const f of SHELL) copyFile(path.join(ROOT, f), path.join(OUT, f));
copyDir(path.join(ROOT, 'icons'), path.join(OUT, 'icons'));
copyDir(path.join(ROOT, 'dist'), path.join(OUT, 'dist'));
copyDir(path.join(ROOT, 'image'), path.join(OUT, 'image'));
copyDir(path.join(ROOT, 'assets', 'art'), path.join(OUT, 'assets', 'art'));

const picked = CATALOG.tracks
  .filter(t => /^Essentials/.test(t.album) || t.album === 'The Life Of A Showgirl')
  .slice(0, LIMIT);

const musicOut = path.join(OUT, 'assets', 'music');
mkdir(musicOut);

let bytes = 0;
for (const t of picked) {
  const file = decodeURIComponent(t.src.replace(/^assets\/music\//, ''));
  const src = path.join(ROOT, 'assets', 'music', file);
  const dest = path.join(musicOut, file);
  if (!fs.existsSync(src)) {
    console.warn('skip missing', file);
    continue;
  }
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src, '-vn', '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-ac', '2',
    dest
  ]);
  bytes += fs.statSync(dest).size;
  process.stdout.write('.');
}

const cloudCatalog = {
  name: CATALOG.name,
  count: picked.length,
  generatedAt: new Date().toISOString(),
  note: 'Cloud pack (96 kbps). Full 177-track library ships with the local app.',
  tracks: picked
};
fs.writeFileSync(path.join(OUT, 'assets', 'catalog.json'), JSON.stringify(cloudCatalog, null, 2));

console.log('\n.cloud pack:', picked.length, 'tracks,', (bytes / 1e6).toFixed(1), 'MB audio');
console.log('total dir:', execFileSync('du', ['-sh', OUT], { encoding: 'utf8' }).trim());

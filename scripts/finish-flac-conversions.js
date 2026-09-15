#!/usr/bin/env node
/**
 * finish-flac-conversions.js — convert the remaining FLACs in songs/ to
 * assets/music/*.mp3 (320k CBR). Handles filenames with special characters
 * that the shell pipeline mangled. Run once, then delete.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SONGS = path.join(ROOT, 'songs');
const OUT = path.join(ROOT, 'assets', 'music');

const flacs = fs.readdirSync(SONGS).filter(f => f.toLowerCase().endsWith('.flac')).sort();
let converted = 0, already = 0, failed = 0;
const failures = [];
for (const f of flacs) {
  const dest = path.join(OUT, f.replace(/\.flac$/i, '.mp3'));
  if (fs.existsSync(dest)) { already++; continue; }
  try {
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
      '-i', path.join(SONGS, f), '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', dest]);
    converted++;
  } catch (e) {
    failed++; failures.push(f + ' -> ' + (e.message || e).toString().slice(0, 120));
  }
}
console.log('FLAC already present:', already, '| converted now:', converted, '| failed:', failed);
failures.forEach(x => console.log('  FAIL:', x));

// Full inventory check: every source must have exactly one destination.
const have = new Set(fs.readdirSync(OUT).filter(f => f.toLowerCase().endsWith('.mp3')));
let missing = 0;
for (const f of fs.readdirSync(SONGS)) {
  const lower = f.toLowerCase();
  const target = lower.endsWith('.flac') ? f.replace(/\.flac$/i, '.mp3') : f;
  if (!have.has(target)) { missing++; console.log('  MISSING:', target); }
}
console.log('Total assets:', have.size, '| source files with no asset:', missing);

let bytes = 0;
for (const f of have) bytes += fs.statSync(path.join(OUT, f)).size;
console.log('Total size:', (bytes / 1073741824).toFixed(2), 'GB');

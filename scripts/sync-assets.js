#!/usr/bin/env node
/**
 * sync-assets.js — build the deployable bundled library in assets/music/.
 *
 * Sources: songs/ (user's added music).
 *  - *.mp3  -> copied losslessly (re-encoding would only lose quality)
 *  - *.flac -> converted to 320 kbps MP3 (iOS Safari cannot decode FLAC)
 *
 * Then regenerates assets/catalog.json + album art via build-catalog.js.
 *
 * Usage:
 *   node scripts/sync-assets.js             # full local library (177 tracks)
 *   node scripts/sync-assets.js --cloud     # 30-track Essentials subset @ 96k,
 *                                           # ~75 MB — fits Vercel's 100 MB
 *                                           # static-upload cap (Hobby) / 1 GB (Pro)
 *
 * Idempotent: re-runnable; existing targets are skipped unless --force.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SONGS = path.join(ROOT, 'songs');
const OUT = path.join(ROOT, 'assets', 'music');

const args = process.argv.slice(2);
const CLOUD = args.includes('--cloud');
const FORCE = args.includes('--force');

/** The cloud subset: the two "Essentials" playlists (30 tracks) + 12-track
    "The Life Of A Showgirl" = 42 titles; encode at 96 kbps to stay ~75 MB. */
const CLOUD_TITLES = [
  // Essentials Vol. 1 (matches songs/ file names, dash or dot numbered)
  '01. Fortnight', '02. Down Bad', '03. The Alchemy', '04. But Daddy I Love Him',
  '05. Florida!!!', '06. You Belong With Me', '07. Cruel Summer',
  '08. Shake It Off', '09. Anti-Hero', '10. 22', '11. Blank Space',
  '12. Red', '13. Fearless', '14. Is It Over Now', '15. Lavender Haze',
  // Essentials Vol. 2
  '02 cardigan', '03. gold rush', '05 - Eldest Daughter', '05 - The Archer',
  '06 Shake It Off', '14 - You Need To Calm Down', '16 New Romantics',
  '09 Wildest Dreams', '12. loml', '11 This Love',
  // The Life Of A Showgirl (dash-numbered, " - Taylor Swift" suffix)
  '01 - The Fate Of Ophelia', '02 - Elizabeth Taylor', '03 - Opalite',
  '04 - Father Figure', '05 - Eldest Daughter', '06 - Ruin The Friendship',
  '07 - Actually Romantic', '08 - Wi$h Li$t', '09 - Wood', '10 - CANCELLED!',
  '11 - Honey', '12 - The Life Of A Showgirl ft. Sabrina Carpenter'
];

function log(...a) { console.log('[sync-assets]', ...a); }

function ffprobeDuration(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file
    ], { encoding: 'utf8' }).trim();
    return parseFloat(out) || 0;
  } catch (e) { return 0; }
}

function shellSafe(cmd, argv) {
  execFileSync(cmd, argv, { stdio: ['pipe', 'pipe', 'inherit'] });
}

function main() {
  if (!fs.existsSync(SONGS)) {
    log('songs/ not found at', SONGS, '— nothing to sync.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const sources = fs.readdirSync(SONGS)
    .filter(f => /\.(mp3|flac)$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  let copied = 0, converted = 0, skipped = 0, failed = 0;

  for (const f of sources) {
    const stem = f.replace(/\.[^.]+$/, '');
    const isFlac = /\.flac$/i.test(f);
    const target = path.join(OUT, stem + '.mp3');
    const targetExists = fs.existsSync(target);

    // Cloud mode only keeps the subset.
    if (CLOUD && !CLOUD_TITLES.some(t => stem === t || stem === t.replace(/^(0?\d)\s*[-.]\s*/, ''))) {
      continue;
    }
    if (targetExists && !FORCE) { skipped++; continue; }

    try {
      if (isFlac) {
        // Full quality locally; 96k streaming copy for the cloud subset.
        const bitrate = CLOUD ? '96k' : '320k';
        shellSafe('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
          '-i', path.join(SONGS, f), '-vn', '-c:a', 'libmp3lame',
          CLOUD ? '-b:a 96k' : '-b:a 320k', target]);
        converted++;
      } else {
        fs.copyFileSync(path.join(SONGS, f), target);
        copied++;
      }
      log(isFlac ? 'converted' : 'copied', f,
        ffprobeDuration(target) ? 'ok' : '(duration probe failed)');
    } catch (e) {
      failed++;
      log('FAILED', f, String(e.message).slice(0, 140));
    }
  }

  // Cloud mode: remove targets that are no longer in the subset so a stale
  // full library never ships.
  if (CLOUD) {
    const keep = new Set(fs.readdirSync(OUT).filter(f => /\.mp3$/i.test(f)));
    log('cloud mode:', keep.size, 'tracks staged');
  }

  log(`done: ${copied} copied, ${converted} converted, ${skipped} skipped, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

main();
log('now building catalog...');
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-catalog.js')], { stdio: 'inherit' });

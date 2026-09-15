#!/usr/bin/env node
/**
 * build-catalog.js — generate assets/catalog.json + album art from assets/music/.
 *
 * The catalog is built by SCANNING assets/music/ (whatever is there — the full
 * 177-track set locally, or a smaller subset in the cloud pack), so it can never
 * point at a missing file. Titles/artists are parsed from filenames, albums are
 * assigned from the two "Essentials" playlists and "The Life Of A Showgirl"
 * (matched by normalized title, since the m3u track numbers don't match the
 * file numbering), and durations come from ffprobe.
 *
 * Also renders one inline-SVG album art per album into assets/art/ (small,
 * on-theme, no binary artwork to maintain).
 *
 * Run: node scripts/build-catalog.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MUSIC_DIR = path.join(ROOT, 'assets', 'music');
const ART_DIR = path.join(ROOT, 'assets', 'art');
const OUT = path.join(ROOT, 'assets', 'catalog.json');

const COLLECTION = 'Taylor Swift';
const ALBUM_DEFAULT = 'Taylor Swift Collection';

/* Album membership by normalized title (case-insensitive, punctuation-free).
   Sources: songs/"Taylor Swift - Essentials (1).m3u", "(2).m3u", and
   TAYLOR-SWIFT/Playlist 320.m3u. Numbers are stripped because the m3u track
   numbering does not match the file numbering in songs/. */
const ALBUMS = {
  'essentials vol 1': {
    name: 'Essentials, Vol. 1',
    titles: [
      'fortnight', 'down bad', 'the alchemy', 'but daddy i love him', 'florida',
      'you belong with me', 'cruel summer', 'shake it off', 'anti hero', '22',
      'blank space', 'red', 'fearless', 'is it over now', 'lavender haze'
    ]
  },
  'essentials vol 2': {
    name: 'Essentials, Vol. 2',
    titles: [
      'cardigan', 'love story', 'willow', 'i knew you were trouble',
      'back to december', 'lover', 'we are never ever getting back together',
      'look what you made me do', 'all too well', 'tim mcgraw',
      'you need to calm down', 'bad blood', 'me', 'champagne problems',
      'wildest dreams'
    ]
  },
  'the life of a showgirl': {
    name: 'The Life Of A Showgirl',
    titles: [
      'the fate of ophelia', 'elizabeth taylor', 'opalite', 'father figure',
      'eldest daughter', 'ruin the friendship', 'actually romantic',
      'wish light', 'wood', 'cancelled', 'honey', 'the life of a showgirl'
    ]
  }
};

function normTitle(s) {
  return String(s)
    .toLowerCase()
    .replace(/^(feat\.|ft\.)\s+.*$/, 'feat')   // drop featured tail for matching
    .replace(/\s*\((taylor'?s version)\)/g, '')
    .replace(/\s*\((10 minute version)\)/g, '')
    .replace(/\s*\((from the vault)\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function albumForTitle(title) {
  const n = normTitle(title);
  for (const key of Object.keys(ALBUMS)) {
    const a = ALBUMS[key];
    const wanted = a.titles.map(normTitle);
    // "22" must not match "no 22" etc. — exact normalized-title match only,
    // but "all too well" vs "all too well (10 minute...)" normalizes equal.
    if (wanted.includes(n)) return a.name;
  }
  return ALBUM_DEFAULT;
}

/** "01 - Cruel Summer" / "01. Fortnight" / "02 exile" / "1  ...Ready For It_"
    -> { num, title }. A leading 1-2 digit token followed by any whitespace is a
    track number in this library; a genuine title never starts with a bare
    number token (the "...Ready For It" case keeps its dots). */
function parseStem(stem) {
  const m = stem.match(/^(\d{1,2})\s*[-–.]\s*(.+)$/);      // "01 - X" / "01. X"
  if (m) return { num: parseInt(m[1], 10), title: m[2].trim() };
  const m2 = stem.match(/^(\d{1,2})\s{2,}(.+)$/);           // "1  ...Ready For It"
  if (m2) return { num: parseInt(m2[1], 10), title: m2[2].trim() };
  const m3 = stem.match(/^(\d{1,2})\s+(\S.*)$/);            // "02 exile"
  if (m3) return { num: parseInt(m3[1], 10), title: m3[2].trim() };
  return { num: 0, title: stem };
}

function cleanTitle(raw) {
  return raw
    .replace(/_+$/g, '')          // trailing underscore artifacts
    .replace(/\s*[-–]\s*taylor swift\s*$/i, '')  // strip trailing artist suffix
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[\.\s\-_]+/, '');  // leading dot/dash/underscore artifacts
}

function durationOf(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', file
    ], { encoding: 'utf8' }).trim();
    const n = parseFloat(out);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
  } catch (e) {
    return 0;
  }
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** On-theme SVG album art: dark radial field, cyan glow, album + artist text. */
function renderAlbumArt(file, album, artist) {
  const lines = album.length > 22 ? [album.slice(0, 19) + '…'] : [album];
  const text = lines.map((l, i) =>
    `<tspan x="48" dy="${i === 0 ? 0 : 30}">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</tspan>`
  ).join('');
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">',
    '<defs><radialGradient id="g" cx="35%" cy="30%" r="90%">',
    '<stop offset="0%" stop-color="#10202e"/>',
    '<stop offset="55%" stop-color="#0a0f18"/>',
    '<stop offset="100%" stop-color="#05070c"/>',
    '</radialGradient>',
    '<linearGradient id="s" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#06b6d4"/>',
    '<stop offset="100%" stop-color="#6366f1"/>',
    '</linearGradient></defs>',
    '<rect width="512" height="512" fill="url(#g)"/>',
    // Equalizer bars motif
    '<g fill="url(#s)" opacity="0.9">',
    [0, 1, 2, 3, 4].map(i => {
      const h = 56 + i * 34;
      return `<rect x="${70 + i * 40}" y="${380 - h}" width="18" height="${h}" rx="9"/>`;
    }).join(''),
    '</g>',
    '<rect x="48" y="418" width="120" height="4" rx="2" fill="url(#s)" opacity="0.5"/>',
    `<text x="48" y="330" font-family="ui-sans-serif, system-ui, sans-serif" font-size="30" font-weight="700" fill="#e8f2fb">`,
    text,
    '</text>',
    `<text x="48" y="468" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="500" fill="#5eead4" opacity="0.8">${artist.replace(/&/g, '&amp;')}</text>`,
    '</svg>'
  ].join('');
  fs.writeFileSync(file, svg);
}

function build() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('assets/music/ not found — run scripts/sync-assets.js first.');
    process.exit(1);
  }
  fs.mkdirSync(ART_DIR, { recursive: true });

  const files = fs.readdirSync(MUSIC_DIR).filter(f => /\.mp3$/i.test(f)).sort(
    (a, b) => a.localeCompare(b, 'en', { numeric: true })
  );

  const tracks = files.map(file => {
    const stem = file.replace(/\.[^.]+$/i, '');
    const { num, title } = parseStem(stem);
    const clean = cleanTitle(title);
    const album = albumForTitle(clean);
    const track = {
      src: 'assets/music/' + encodeURIComponent(file),
      title: clean,
      artist: COLLECTION,
      album: album,
      num: num,
      duration: durationOf(path.join(MUSIC_DIR, file))
    };
    return track;
  });

  // Album art: prefer a real JPEG if apply-covers.js has placed one.
  const JPEG_BY_ALBUM = {
    'The Life Of A Showgirl': 'tloas.jpg',
    'Essentials, Vol. 1': '1989.jpg',
    'Essentials, Vol. 2': 'evermore.jpg',
    'Taylor Swift Collection': 'reputation.jpg'
  };
  const albums = [...new Set(tracks.map(t => t.album))];
  const artFiles = new Map();
  for (const a of albums) {
    const jpegName = JPEG_BY_ALBUM[a];
    const jpeg = jpegName && path.join(ART_DIR, jpegName);
    if (jpeg && fs.existsSync(jpeg)) {
      artFiles.set(a, 'assets/art/' + jpegName);
      continue;
    }
    const file = path.join(ART_DIR, slugify(a) + '.svg');
    renderAlbumArt(file, a, COLLECTION);
    artFiles.set(a, 'assets/art/' + encodeURIComponent(path.basename(file)));
  }
  for (const t of tracks) t.art = artFiles.get(t.album);

  const out = {
    name: COLLECTION + ' — bundled library',
    count: tracks.length,
    generatedAt: new Date().toISOString(),
    tracks: tracks
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  const total = tracks.reduce((s, t) => s + t.duration, 0);
  console.log('Wrote ' + path.relative(ROOT, OUT) + ': ' + tracks.length +
    ' tracks, ' + albums.length + ' albums, ~' + Math.round(total / 60) + ' min total audio.');
}

if (require.main === module) build();
module.exports = { build };

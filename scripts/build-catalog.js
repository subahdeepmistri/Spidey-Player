#!/usr/bin/env node
/**
 * build-catalog.js — generate assets/catalog.json from assets/music/.
 * Album membership is by official track title (not the old 4-bucket
 * "Essentials" grouping). Art comes from assets/art/*.jpg when present.
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

const ALBUMS = [
  {
    name: 'The Life Of A Showgirl',
    titles: [
      'the fate of ophelia', 'elizabeth taylor', 'opalite', 'father figure',
      'eldest daughter', 'ruin the friendship', 'actually romantic',
      'wish list', 'wood', 'cancelled', 'honey', 'the life of a showgirl'
    ]
  },
  {
    name: 'The Tortured Poets Department',
    titles: [
      'fortnight', 'the tortured poets department',
      'my boy only breaks his favorite toys', 'down bad', 'so long london',
      'but daddy i love him', 'fresh out the slammer', 'florida',
      'guilty as sin', 'whos afraid of little old me',
      'i can fix him no really i can', 'loml',
      'i can do it with a broken heart', 'the smallest man who ever lived',
      'the alchemy', 'clara bow', 'the black dog', 'imgonnagetyouback',
      'the albatross', 'chloe or sam or sophia or marcus', 'how did it end',
      'so high school', 'i hate it here', 'thank you aimee',
      'i look in peoples windows', 'the prophecy', 'cassandra', 'peter',
      'the bolter', 'robin', 'the manuscript'
    ]
  },
  {
    name: 'Midnights',
    titles: [
      'lavender haze', 'maroon', 'anti hero', 'snow on the beach',
      'youre on your own kid', 'midnight rain', 'question',
      'vigilante shit', 'bejeweled', 'labyrinth', 'karma', 'sweet nothing',
      'mastermind', 'meet me at midnight', 'hits different',
      'high infidelity', 'glitch', 'wouldve couldve shouldve', 'dear reader',
      'youre losing me'
    ]
  },
  {
    name: 'evermore',
    titles: [
      'willow', 'champagne problems', 'gold rush', 'tis the damn season',
      'tolerate it', 'no body no crime', 'happiness', 'dorothea',
      'coney island', 'ivy', 'cowboy like me', 'long story short',
      'marjorie', 'closure', 'evermore', 'right where you left me',
      'its time to go'
    ]
  },
  {
    name: 'folklore',
    titles: [
      'the 1', 'cardigan', 'the last great american dynasty', 'exile',
      'my tears ricochet', 'mirrorball', 'seven', 'august',
      'this is me trying', 'illicit affairs', 'invisible string',
      'mad woman', 'epiphany', 'betty', 'peace', 'hoax', 'the lakes'
    ]
  },
  {
    name: 'Lover',
    titles: [
      'i forgot that you existed', 'cruel summer', 'lover', 'the man',
      'the archer', 'i think he knows',
      'miss americana the heartbreak prince', 'paper rings',
      'cornelia street', 'death by a thousand cuts', 'london boy',
      'soon youll get better', 'false god', 'you need to calm down',
      'afterglow', 'me', 'its nice to have a friend', 'daylight'
    ]
  },
  {
    name: 'reputation',
    titles: [
      'ready for it', 'end game', 'i did something bad', 'dont blame me',
      'delicate', 'look what you made me do', 'so it goes', 'gorgeous',
      'getaway car', 'king of my heart', 'dancing with our hands tied',
      'dress', 'this is why we cant have nice things',
      'call it what you want', 'new years day'
    ]
  },
  {
    name: '1989',
    titles: [
      'welcome to new york', 'blank space', 'style', 'out of the woods',
      'all you had to do was stay', 'shake it off', 'i wish you would',
      'bad blood', 'wildest dreams', 'how you get the girl', 'this love',
      'i know places', 'clean', 'wonderland', 'you are in love',
      'new romantics', 'is it over now', 'now that we dont talk',
      'say dont go', 'suburban legends', 'slut'
    ]
  },
  {
    name: "Red (Taylor's Version)",
    titles: [
      'state of grace', 'red', 'treacherous', 'i knew you were trouble',
      'all too well', '22', 'i almost do',
      'we are never ever getting back together', 'stay stay stay',
      'the last time', 'holy ground', 'sad beautiful tragic',
      'the lucky one', 'everything has changed', 'starlight', 'begin again',
      'the moment i knew', 'come back be here', 'girl at home', 'ronan',
      'better man', 'nothing new', 'babe', 'message in a bottle',
      'i bet you think about me', 'forever winter', 'run',
      'the very first night'
    ]
  },
  {
    name: 'Speak Now',
    titles: [
      'mine', 'sparks fly', 'back to december', 'speak now', 'dear john',
      'mean', 'the story of us', 'never grow up', 'enchanted',
      'better than revenge', 'innocent', 'haunted', 'last kiss',
      'long live', 'ours', 'if this was a movie', 'superman',
      'electric touch', 'when emma falls in love', 'i can see you',
      'castles crumbling', 'foolish one', 'timeless'
    ]
  },
  {
    name: 'Fearless',
    titles: [
      'fearless', 'fifteen', 'love story', 'hey stephen', 'white horse',
      'you belong with me', 'breathe', 'tell me why', 'youre not sorry',
      'the way i loved you', 'forever always', 'the best day', 'change',
      'jump then fall', 'untouchable', 'come in with the rain', 'superstar',
      'the other side of the door', 'today was a fairytale',
      'you all over me', 'mr perfectly fine', 'we were happy', 'thats when',
      'dont you', 'bye bye baby'
    ]
  },
  {
    name: 'Taylor Swift',
    titles: [
      'tim mcgraw', 'picture to burn', 'teardrops on my guitar',
      'a place in this world', 'cold as you', 'the outside',
      'tied together with a smile', 'stay beautiful', 'shouldve said no',
      'marys song', 'our song', 'im only me when im with you', 'invisible',
      'a perfectly good heart'
    ]
  }
];

const JPEG_BY_ALBUM = {
  'The Life Of A Showgirl': 'tloas.jpg',
  'The Tortured Poets Department': 'ttpd.jpg',
  'Midnights': 'midnights.jpg',
  'evermore': 'evermore.jpg',
  'folklore': 'folklore.jpg',
  'Lover': 'lover.jpg',
  'reputation': 'reputation.jpg',
  '1989': '1989.jpg',
  "Red (Taylor's Version)": 'red.jpg',
  'Speak Now': 'speak-now.jpg',
  'Fearless': 'fearless.jpg',
  'Taylor Swift': 'debut.jpg'
};

function normTitle(s) {
  return String(s)
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/_/g, ' ')
    .replace(/\(taylor'?s version\)/g, '')
    .replace(/\(from the vault\)/g, '')
    .replace(/\(10 minute version\)/g, '')
    .replace(/\(acoustic version\)/g, '')
    .replace(/\(feat\.[^)]*\)/g, '')
    .replace(/\(ft\.[^)]*\)/g, '')
    .replace(/\s+(feat\.|ft\.)\s+.*$/g, '')
    .replace(/-?\s*voice memos?/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function albumForTitle(title) {
  const n = normTitle(title);
  for (const a of ALBUMS) {
    if (a.titles.map(normTitle).includes(n)) return a.name;
  }
  return 'Taylor Swift Collection';
}

function parseStem(stem) {
  const m = stem.match(/^(\d{1,2})\s*[-–.]\s*(.+)$/);
  if (m) return { num: parseInt(m[1], 10), title: m[2].trim() };
  const m2 = stem.match(/^(\d{1,2})\s{2,}(.+)$/);
  if (m2) return { num: parseInt(m2[1], 10), title: m2[2].trim() };
  const m3 = stem.match(/^(\d{1,2})\s+(\S.*)$/);
  if (m3) return { num: parseInt(m3[1], 10), title: m3[2].trim() };
  return { num: 0, title: stem };
}

function cleanTitle(raw) {
  return raw
    .replace(/_+$/g, '')
    .replace(/\s*[-–]\s*taylor swift\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[\.\s\-_]+/, '');
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
    return {
      src: 'assets/music/' + encodeURIComponent(file),
      title: clean,
      artist: COLLECTION,
      album: album,
      num: num,
      duration: durationOf(path.join(MUSIC_DIR, file))
    };
  });

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
  const counts = {};
  for (const t of tracks) counts[t.album] = (counts[t.album] || 0) + 1;
  console.log('Wrote ' + path.relative(ROOT, OUT) + ': ' + tracks.length + ' tracks');
  console.log(counts);
  const unmatched = tracks.filter(t => t.album === 'Taylor Swift Collection');
  if (unmatched.length) {
    console.warn('UNMATCHED', unmatched.length);
    unmatched.forEach(t => console.warn(' -', t.title));
  }
}

if (require.main === module) build();
module.exports = { build, albumForTitle, normTitle, cleanTitle, parseStem };

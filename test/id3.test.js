/*
 * Unit tests for id3.js — metadata parsing.
 * Run with: npm test
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// id3.js is a browser script; give it the globals it touches.
global.window = global.window || {};
require(path.join(__dirname, '..', 'id3.js'));
const ID3 = global.window.SpideyID3;

/* ---------- tag builders, so tests do not depend on fixture files ---------- */

function syncsafe(n) {
  return [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
}

function textFrame(id, text, encoding = 3, major = 3) {
  const body = Buffer.concat([
    Buffer.from([encoding]),
    encoding === 3 ? Buffer.from(text, 'utf8') : Buffer.from(text, 'latin1'),
    encoding === 0 ? Buffer.from([0]) : Buffer.alloc(0)
  ]);
  // ID3v2.2 uses a 6-byte frame header (3-char id + 3-byte size, no flags).
  // v2.3/v2.4 use a 10-byte header (4-char id + 4-byte size + 2 flag bytes).
  const header = major === 2
    ? Buffer.concat([
        Buffer.from(id, 'latin1'),
        Buffer.from([(body.length >> 16) & 0xff, (body.length >> 8) & 0xff, body.length & 0xff])
      ])
    : Buffer.concat([
        Buffer.from(id, 'latin1'),
        Buffer.from([0, 0, 0, body.length]),
        Buffer.from([0, 0])                    // status + format flags
      ]);
  return Buffer.concat([header, body]);
}

function id3v2(frames, major = 3) {
  const body = Buffer.concat(frames);
  const header = Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([major, 0, 0]),
    Buffer.from(syncsafe(body.length))
  ]);
  return Buffer.concat([header, body]);
}

function apicFrame(mime, imageBytes, description = '') {
  const body = Buffer.concat([
    Buffer.from([3]),                                  // UTF-8
    Buffer.from(mime + '\0', 'latin1'),
    Buffer.from([3]),                                  // picture type: cover (front)
    Buffer.from(description + '\0', 'utf8'),
    imageBytes
  ]);
  return Buffer.concat([
    Buffer.from('APIC', 'latin1'),
    Buffer.from([0, 0, 0, body.length]),
    Buffer.from([0, 0])                                // status + format flags
  , body]);
}

function id3v1({ title, artist, album, year, track }) {
  const buf = Buffer.alloc(128);
  buf.write('TAG', 0, 'latin1');
  buf.write(title || '', 3, 30, 'latin1');
  buf.write(artist || '', 33, 30, 'latin1');
  buf.write(album || '', 63, 30, 'latin1');
  buf.write(year || '', 93, 4, 'latin1');
  if (track) { buf[125] = 0; buf[126] = track; }
  return buf;
}

function audioFile(name, ...chunks) {
  return new File(chunks, name, { type: 'audio/mpeg' });
}

/* ---------------------------- tests ---------------------------- */

test('reads ID3v2.3 text frames', async () => {
  const file = audioFile('song.mp3', id3v2([
    textFrame('TIT2', 'Cruel Summer'),
    textFrame('TPE1', 'Taylor Swift'),
    textFrame('TALB', 'Lover'),
    textFrame('TRCK', '2/18'),
    textFrame('TYER', '2019')
  ]));
  const meta = await ID3.readMetadata(file);
  assert.equal(meta.title, 'Cruel Summer');
  assert.equal(meta.artist, 'Taylor Swift');
  assert.equal(meta.album, 'Lover');
  assert.equal(meta.track, '2/18');
  assert.equal(meta.year, '2019');
});

test('reads ID3v2.2 three-character frame ids', async () => {
  const file = audioFile('old.mp3', id3v2([
    textFrame('TT2', 'Tim McGraw', 3, 2),
    textFrame('TP1', 'Taylor Swift', 3, 2)
  ], 2));
  const meta = await ID3.readMetadata(file);
  assert.equal(meta.title, 'Tim McGraw');
  assert.equal(meta.artist, 'Taylor Swift');
});

test('extracts embedded cover art', async () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
  const file = audioFile('art.mp3', id3v2([
    textFrame('TIT2', 'With Art'),
    apicFrame('image/jpeg', jpeg)
  ]));
  const meta = await ID3.readMetadata(file);
  assert.ok(meta.cover, 'cover should be present');
  assert.equal(meta.cover.mime, 'image/jpeg');
  assert.equal(meta.cover.bytes.length, jpeg.length);
});

test('falls back to ID3v1 when no ID3v2 tag exists', async () => {
  const file = audioFile('legacy.mp3',
    Buffer.alloc(256, 1),
    id3v1({ title: 'Legacy Song', artist: 'Legacy Artist', album: 'Old Album', year: '1999', track: 7 }));
  const meta = await ID3.readMetadata(file);
  assert.equal(meta.title, 'Legacy Song');
  assert.equal(meta.artist, 'Legacy Artist');
  assert.equal(meta.album, 'Old Album');
  assert.equal(meta.year, '1999');
  assert.equal(meta.track, '7');
});

test('reads FLAC Vorbis comments', async () => {
  const comments = ['TITLE=willow', 'ARTIST=Taylor Swift', 'ALBUM=evermore', 'TRACKNUMBER=1'];
  const vendor = 'reference libFLAC';
  const parts = [];
  const vlen = Buffer.alloc(4); vlen.writeUInt32LE(vendor.length);
  parts.push(vlen, Buffer.from(vendor, 'latin1'));
  const clen = Buffer.alloc(4); clen.writeUInt32LE(comments.length);
  parts.push(clen);
  for (const c of comments) {
    const b = Buffer.from(c, 'utf8');
    const l = Buffer.alloc(4); l.writeUInt32LE(b.length);
    parts.push(l, b);
  }
  const block = Buffer.concat(parts);
  const blockHeader = Buffer.concat([
    Buffer.from([0x84]),                                  // last block, type 4
    Buffer.from([(block.length >> 16) & 0xff, (block.length >> 8) & 0xff, block.length & 0xff])
  ]);
  const file = audioFile('song.flac', Buffer.concat([
    Buffer.from('fLaC', 'latin1'), blockHeader, block
  ]));
  const meta = await ID3.readMetadata(file);
  assert.equal(meta.title, 'willow');
  assert.equal(meta.artist, 'Taylor Swift');
  assert.equal(meta.album, 'evermore');
  assert.equal(meta.track, '1');
});

test('returns an empty object for a file with no tags', async () => {
  const file = audioFile('plain.mp3', Buffer.alloc(512, 3));
  const meta = await ID3.readMetadata(file);
  assert.deepEqual(meta, {});
});

test('never rejects on a corrupt tag', async () => {
  // Declares a huge tag size but supplies almost no data.
  const header = Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([3, 0, 0]),
    Buffer.from(syncsafe(10 * 1024 * 1024))
  ]);
  const file = audioFile('corrupt.mp3', header, Buffer.alloc(32, 9));
  const meta = await ID3.readMetadata(file);
  assert.equal(typeof meta, 'object');
  assert.ok(!meta.title || typeof meta.title === 'string');
});

test('does not treat arbitrary bytes as a frame id', async () => {
  // Padding of zeros after a valid frame must terminate the scan cleanly.
  const file = audioFile('pad.mp3', id3v2([
    textFrame('TIT2', 'Padded'),
    Buffer.alloc(64, 0)
  ]));
  const meta = await ID3.readMetadata(file);
  assert.equal(meta.title, 'Padded');
});

test('parses every real file in the songs/ directory', { skip: !fs.existsSync(path.join(__dirname, '..', 'songs')) }, async () => {
  const dir = path.join(__dirname, '..', 'songs');
  const files = fs.readdirSync(dir).filter(f => /\.(mp3|flac)$/i.test(f));
  if (!files.length) return;

  let withTitle = 0;
  for (const name of files) {
    const buf = fs.readFileSync(path.join(dir, name));
    const meta = await ID3.readMetadata(new File([buf], name, { type: 'audio/mpeg' }));
    if (meta.title) withTitle++;
    assert.equal(typeof meta, 'object', `${name} must yield an object`);
  }
  // The library is tagged; if this drops, the parser regressed.
  assert.ok(withTitle / files.length > 0.9,
    `expected >90% of files to have a title, got ${withTitle}/${files.length}`);
});

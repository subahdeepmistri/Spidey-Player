#!/usr/bin/env node
/**
 * publish-library.js — 96 kbps encode of every bundled track, upload to the
 * public Vercel Blob store, write .cloud/ catalog with those URLs.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { put } = require('@vercel/blob');
const execFileAsync = promisify(execFile);

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.cloud');
const TMP = path.join(ROOT, '.cloud-audio');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'catalog.json'), 'utf8'));
const ENCODE_CONC = 4;
const UPLOAD_CONC = 6;

function loadBlobToken() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('missing .env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^BLOB_READ_WRITE_TOKEN=(.*)$/);
    if (m) process.env.BLOB_READ_WRITE_TOKEN = m[1].replace(/^['"]|['"]$/g, '');
  }
  delete process.env.VERCEL_OIDC_TOKEN;
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('no blob token');
}

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

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function encodeOne(src, dest) {
  mkdir(path.dirname(dest));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return;
  await execFileAsync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src, '-vn', '-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-ac', '2',
    dest
  ]);
}

async function blobPut(file, pathname) {
  const buf = fs.readFileSync(file);
  const blob = await put(pathname, buf, {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'audio/mpeg',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    cacheControlMaxAge: 31536000
  });
  if (!blob || !blob.url) throw new Error('no url for ' + pathname);
  return blob.url;
}

function copyShell() {
  fs.rmSync(OUT, { recursive: true, force: true });
  mkdir(OUT);
  for (const f of [
    'index.html', 'app.js', 'db.js', 'id3.js', 'sw.js', 'style.css',
    'manifest.json', 'vercel.json'
  ]) copyFile(path.join(ROOT, f), path.join(OUT, f));
  copyDir(path.join(ROOT, 'icons'), path.join(OUT, 'icons'));
  copyDir(path.join(ROOT, 'dist'), path.join(OUT, 'dist'));
  copyDir(path.join(ROOT, 'image'), path.join(OUT, 'image'));
  copyDir(path.join(ROOT, 'assets', 'art'), path.join(OUT, 'assets', 'art'));
}

async function main() {
  loadBlobToken();
  mkdir(TMP);
  copyShell();

  const jobs = [];
  for (const t of CATALOG.tracks) {
    const file = decodeURIComponent(String(t.src).replace(/^assets\/music\//, ''));
    const src = path.join(ROOT, 'assets', 'music', file);
    if (!fs.existsSync(src)) {
      console.warn('skip missing', file);
      continue;
    }
    jobs.push({ t, file, src, tmp: path.join(TMP, file) });
  }

  console.log('encoding', jobs.length, 'tracks…');
  await pool(jobs, ENCODE_CONC, async (job, i) => {
    await encodeOne(job.src, job.tmp);
    if ((i + 1) % 20 === 0 || i === jobs.length - 1) {
      console.log('encoded', (i + 1) + '/' + jobs.length);
    }
  });

  console.log('uploading…');
  const tracks = await pool(jobs, UPLOAD_CONC, async (job, i) => {
    const url = await blobPut(job.tmp, 'music/' + job.file);
    if ((i + 1) % 10 === 0 || i === jobs.length - 1) {
      console.log('uploaded', (i + 1) + '/' + jobs.length);
    }
    return Object.assign({}, job.t, { src: url });
  });

  const cloudCatalog = {
    name: CATALOG.name,
    count: tracks.length,
    generatedAt: new Date().toISOString(),
    tracks: tracks
  };
  mkdir(path.join(OUT, 'assets'));
  fs.writeFileSync(path.join(OUT, 'assets', 'catalog.json'), JSON.stringify(cloudCatalog, null, 2));
  console.log('published', tracks.length, 'tracks');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});

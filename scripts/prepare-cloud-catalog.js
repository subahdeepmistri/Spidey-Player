#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

if (!process.env.VERCEL) process.exit(0);

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'assets', 'catalog.cloud.json');
const dest = path.join(root, 'assets', 'catalog.json');
if (!fs.existsSync(src)) {
  console.warn('prepare-cloud-catalog: no assets/catalog.cloud.json');
  process.exit(0);
}
fs.copyFileSync(src, dest);
const catalog = JSON.parse(fs.readFileSync(dest, 'utf8'));
console.log('prepare-cloud-catalog: ' + catalog.count + ' blob tracks');

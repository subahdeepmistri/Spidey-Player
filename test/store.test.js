'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStore() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8');
  const ls = new Map();
  const localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); }
  };
  const ctx = { window: {}, localStorage, CustomEvent: function () {} };
  ctx.window = ctx;
  ctx.global = ctx;
  vm.runInNewContext(code, ctx);
  return ctx.window.SpideyStore;
}

test('load returns fallback on missing and corrupt JSON', () => {
  const s = loadStore();
  assert.deepEqual(s.load(s.KEYS.PREFS, { v: 1 }), { v: 1 });
  s.save(s.KEYS.PREFS, { volume: 0.5, muted: false, shuffle: false, repeat: 'off' });
  assert.equal(s.load(s.KEYS.PREFS, {}).volume, 0.5);
});

test('save then load round-trips hidden titles', () => {
  const s = loadStore();
  s.save(s.KEYS.HIDDEN, ['Fortnight']);
  assert.equal(JSON.stringify(s.load(s.KEYS.HIDDEN, [])), JSON.stringify(['Fortnight']));
});

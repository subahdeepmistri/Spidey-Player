/*
 * store.js — the only module that touches localStorage for JSON prefs.
 * Keys keep their .v1 names so existing data is not orphaned.
 */
(function (global) {
  'use strict';

  var KEYS = {
    PREFS: 'spidey.prefs.v1',
    SESSION: 'spidey.session.v1',
    HIDDEN: 'spidey.hidden.v1',
    IOS_BANNER: 'spidey.ios-banner-dismissed.v1'
  };

  var lastQuotaWarn = 0;

  function parse(raw, fallback) {
    if (raw == null || raw === '') return fallback;
    try {
      var v = JSON.parse(raw);
      if (v === null || typeof v === 'number' && !Number.isFinite(v)) return fallback;
      return v;
    } catch (e) {
      return fallback;
    }
  }

  function load(key, fallback) {
    try {
      return parse(localStorage.getItem(key), fallback);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      var json = JSON.stringify(value);
      if (json === undefined) return { ok: false, reason: 'unserializable' };
      localStorage.setItem(key, json);
      return { ok: true };
    } catch (e) {
      var quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      if (quota && Date.now() - lastQuotaWarn > 60000) {
        lastQuotaWarn = Date.now();
        if (typeof global.dispatchEvent === 'function') {
          try {
            global.dispatchEvent(new CustomEvent('spidey-store-quota', { detail: { key: key } }));
          } catch (e2) { /* IE */ }
        }
      }
      return { ok: false, reason: quota ? 'quota' : 'unavailable' };
    }
  }

  function remove(key) {
    try { localStorage.removeItem(key); return { ok: true }; }
    catch (e) { return { ok: false, reason: 'unavailable' }; }
  }

  var listeners = [];
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) { return x !== fn; });
    };
  }

  if (global.addEventListener) {
    global.addEventListener('storage', function (e) {
      if (!e.key || !Object.keys(KEYS).some(function (k) { return KEYS[k] === e.key; })) return;
      var next = parse(e.newValue, null);
      listeners.forEach(function (fn) {
        try { fn(e.key, next); } catch (err) { /* listener errors must not break others */ }
      });
    });
  }

  global.SpideyStore = {
    KEYS: KEYS,
    load: load,
    save: save,
    remove: remove,
    subscribe: subscribe
  };
})(window);

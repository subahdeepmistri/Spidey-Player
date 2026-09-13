/*
 * db.js — IndexedDB persistence for the Spidey Player library.
 *
 * Schema v2
 *   tracks : keyPath 'uid'      — one record per imported song
 *            index  'fingerprint' — name|size|lastModified, used to reject re-imports
 *            index  'title'       — lowercased title+artist+album, used for search
 *   covers : keyPath 'key'      — one blob per distinct cover image (de-duplicated)
 *
 * v1 stored records in a 'songs' store keyed by *filename*, which silently
 * overwrote two different songs that happened to share a name. The upgrade
 * copies every legacy record across before the old store is dropped.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'MusicAppDB';
  var DB_VERSION = 2;
  var LEGACY_STORE = 'songs';
  var TRACK_STORE = 'tracks';
  var COVER_STORE = 'covers';

  var dbPromise = null;

  /* ------------------------------------------------------------------ *
   * helpers
   * ------------------------------------------------------------------ */

  function uid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 't' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 10) + '-' +
           Math.random().toString(36).slice(2, 10);
  }

  /* Identity of a *file*, independent of its position in the library. */
  function fingerprint(file) {
    return file.name + '|' + file.size + '|' + (file.lastModified || 0);
  }

  /* Cheap deterministic hash — used to de-duplicate cover art. */
  function hashBytes(bytes) {
    var h = 0x811c9dc5;
    var limit = Math.min(bytes.length, 4096);
    for (var i = 0; i < limit; i++) {
      h ^= bytes[i];
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36) + '-' + bytes.length.toString(36);
  }

  function searchKey(track) {
    return [track.title, track.artist, track.album, track.name]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function promisify(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onabort = function () { reject(tx.error || new Error('Transaction aborted')); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  /*
   * Read every record from a store.
   *
   * Uses getAll() rather than an openCursor() walk: IDBCursor.continue()
   * returns undefined (not an IDBRequest), so a cursor loop cannot be
   * promisified the way a request can. getAll() keeps the whole read inside
   * a single request and therefore a single transaction lifetime.
   */
  function readAll(store) {
    return promisify(store.getAll());
  }

  /* ------------------------------------------------------------------ *
   * schema
   * ------------------------------------------------------------------ */

  function upgrade(db, oldVersion, tx) {
    if (!db.objectStoreNames.contains(TRACK_STORE)) {
      var tracks = db.createObjectStore(TRACK_STORE, { keyPath: 'uid' });
      tracks.createIndex('fingerprint', 'fingerprint', { unique: false });
    }
    if (!db.objectStoreNames.contains(COVER_STORE)) {
      db.createObjectStore(COVER_STORE, { keyPath: 'key' });
    }

    // v1 -> v2: copy every legacy record into the new tracks store
    // **inside this upgrade transaction** so the old store can be safely deleted.
    // We create minimal v2 records (no async metadata parsing) to ensure
    // crash-safety: if songs is deleted, every legacy file is already in tracks.
    // An enrichment pass runs after open() to add metadata, covers, durations.
    if (oldVersion >= 1 && db.objectStoreNames.contains(LEGACY_STORE)) {
      var legacyStore = tx.objectStore(LEGACY_STORE);
      var tracksStore = tx.objectStore(TRACK_STORE);

      var request = legacyStore.getAll();
      request.onsuccess = function () {
        var legacyRows = request.result || [];
        var now = Date.now();

        for (var i = 0; i < legacyRows.length; i++) {
          var row = legacyRows[i];
          // v1 stored the File directly (keyPath 'name'); be tolerant of shapes.
          var file = row instanceof File || row instanceof Blob ? row : (row && row.file);
          if (!file) continue;

          var record = {
            uid: uid(),
            name: file.name,
            blob: file,
            size: file.size,
            lastModified: file.lastModified || 0,
            fingerprint: fingerprint(file),
            addedAt: now + i, // preserve relative order
            title: cleanFilename(file.name),
            artist: '',
            album: '',
            track: '',
            year: '',
            duration: null,
            coverKey: null,
            searchKey: searchKey({
              title: cleanFilename(file.name),
              artist: '',
              album: '',
              name: file.name
            }),
            _migrated: true  // marker: this record was created during upgrade
          };
          tracksStore.put(record);
        }

        // Keep legacy rows for post-open enrichment pass
        pendingLegacy = legacyRows;
        try { db.deleteObjectStore(LEGACY_STORE); } catch (e) { /* already gone */ }
      };
    }
  }

  var pendingLegacy = [];

  function openRaw() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function (e) {
        upgrade(request.result, e.oldVersion, request.transaction);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () {
        reject(new Error('Database upgrade blocked — close other tabs of this player and reload.'));
      };
    });
  }

  /* Copy v1 records into the v2 track store, parsing metadata as we go.
   Mutates existing v2 records in place — does not create new UIDs. */
  async function migrateLegacy(db, legacyRows, onProgress) {
    if (!legacyRows.length) return { total: 0, migrated: 0, skipped: [] };

    var result = { total: legacyRows.length, migrated: 0, skipped: [] };

    // Legacy rows were stored as [file, ...] in v1, or may include already-migrated
    // records with a uid+file shape. Build a map from legacy identity to v2 uid.
    var legacyToUid = {};

    // First pass: identify each legacy row and find/create its v2 uid.
    for (var i = 0; i < legacyRows.length; i++) {
      var row = legacyRows[i];
      var file = row instanceof File || row instanceof Blob ? row : (row && row.file);
      if (!file) {
        result.skipped.push({ name: row && row.name ? row.name : 'unknown', reason: 'missing-file' });
        continue;
      }
      // Derive the v2 uid that was created during upgrade (using fingerprint as bridge)
      var fp = fingerprint(file);
      legacyToUid[fp] = { row: row, file: file, fp: fp };
    }

    // Second pass: enrich each track in place
    for (var key in legacyToUid) {
      if (!legacyToUid.hasOwnProperty(key)) continue;
      var entry = legacyToUid[key];
      var file = entry.file;

      try {
        var enriched = await buildRecord(file);
        // Update the existing v2 record (created during upgrade) in place
        await withStores([TRACK_STORE, COVER_STORE], 'readwrite', function (s) {
          return promisify(s[TRACK_STORE].get(enriched.uid)).then(function (existing) {
            if (!existing) {
              // Fallback: put the new record (shouldn't happen if upgrade worked)
              if (enriched.cover) {
                s[COVER_STORE].put({ key: enriched.coverKey, mime: enriched.cover.type, blob: enriched.cover });
              }
              s[TRACK_STORE].put(enriched);
              return;
            }
            // Update in place — preserve the existing UID
            existing.title = enriched.title;
            existing.artist = enriched.artist;
            existing.album = enriched.album;
            existing.track = enriched.track;
            existing.year = enriched.year;
            existing.duration = enriched.duration;
            if (enriched.coverKey) existing.coverKey = enriched.coverKey;
            existing.searchKey = enriched.searchKey;
            if (enriched.cover) {
              s[COVER_STORE].put({ key: enriched.coverKey, mime: enriched.cover.type, blob: enriched.cover });
            }
            s[TRACK_STORE].put(existing);
          });
        });
        result.migrated++;
      } catch (e) {
        result.skipped.push({ name: file.name, reason: 'enrichment-failed' });
      }
      if (onProgress) onProgress(result.migrated, result.total, file.name);
    }

    return result;
  }

  /* ------------------------------------------------------------------ *
   * record construction
   * ------------------------------------------------------------------ */

  async function buildRecord(file) {
    var meta = {};
    var duration = NaN;

    if (global.SpideyID3) {
      try { meta = await global.SpideyID3.readMetadata(file); } catch (e) { meta = {}; }
      try { duration = await global.SpideyID3.readDuration(file); } catch (e) { duration = NaN; }
    }

    var record = {
      uid: uid(),
      name: file.name,
      blob: file,
      size: file.size,
      lastModified: file.lastModified || 0,
      fingerprint: fingerprint(file),
      addedAt: Date.now(),
      title: meta.title || cleanFilename(file.name),
      artist: meta.artist || '',
      album: meta.album || '',
      track: meta.track || '',
      year: meta.year || '',
      duration: Number.isFinite(duration) ? duration : null,
      coverKey: null
    };

    if (meta.cover && meta.cover.bytes && meta.cover.bytes.length) {
      var key = hashBytes(meta.cover.bytes);
      record.coverKey = key;
      record.cover = new Blob([meta.cover.bytes], { type: meta.cover.mime || 'image/jpeg' });
    }

    record.searchKey = searchKey(record);
    return record;
  }

  /* "01 - Song.mp3" -> "Song" — used only when the file carries no title tag. */
  function cleanFilename(name) {
    return name
      .replace(/\.[^/.]+$/, '')
      .replace(/^(\d+[\s._-]+)+/, '')
      .replace(/[_]+/g, ' ')
      .trim() || name;
  }

  /* ------------------------------------------------------------------ *
   * public API
   * ------------------------------------------------------------------ */

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = (async function () {
      var db = await openRaw();          // v1 -> v2 upgrade happens here
      if (pendingLegacy.length) {
        var rows = pendingLegacy;
        pendingLegacy = [];
        var result = await migrateLegacy(db, rows);
        // If migration had failures, notify via toast but don't block
        if (result.skipped.length > 0) {
          toast(
            `Library migration: ${result.migrated} song${result.migrated !== 1 ? 's' : ''} migrated, ${result.skipped.length} could not be recovered.`,
            'warn',
            5000
          );
        }
      }
      return db;
    })().catch(function (err) {
      dbPromise = null;                  // allow a retry on the next call
      throw err;
    });
    return dbPromise;
  }

  /*
   * Run `fn` inside a transaction and wait for it to commit.
   *
   * `fn` MUST create its own IDB requests synchronously — IndexedDB
   * auto-commits a transaction as soon as the microtask queue drains with no
   * pending requests, so awaiting anything unrelated inside `fn` would abort
   * the transaction. Promise chains built from the requests themselves are
   * fine, because each request keeps the transaction alive.
   */
  function withStores(names, mode, fn) {
    return open().then(function (db) {
      var tx = db.transaction(names, mode);
      var stores = {};
      names.forEach(function (n) { stores[n] = tx.objectStore(n); });

      var result;
      try {
        result = fn(stores, tx);
      } catch (e) {
        try { tx.abort(); } catch (ignored) { /* already aborted */ }
        return Promise.reject(e);
      }

      // Attach the completion handlers BEFORE awaiting `result`, so the
      // transaction cannot commit while nothing is listening.
      var done = txDone(tx);
      return Promise.resolve(result).then(function (value) {
        return done.then(function () { return value; });
      });
    });
  }

  /**
   * Import files. Rejects re-imports of the same file and reports them.
   * onProgress(done, total, currentName) is called per file.
   */
  async function addTracks(files, onProgress) {
    var db = await open();

    // Existing fingerprints, so a re-import is detected without a scan per file
    var existing = await new Promise(function (resolve, reject) {
      var tx = db.transaction([TRACK_STORE], 'readonly');
      var seen = new Set();
      var cursor = tx.objectStore(TRACK_STORE).index('fingerprint').openKeyCursor();
      cursor.onsuccess = function (e) {
        var c = e.target.result;
        if (c) { seen.add(c.key); c.continue(); } else resolve(seen);
      };
      cursor.onerror = function () { reject(cursor.error); };
    });

    var added = [];
    var skipped = [];
    var seenThisRun = new Set();

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (onProgress) onProgress(i, files.length, file.name);

      var fp = fingerprint(file);
      if (existing.has(fp) || seenThisRun.has(fp)) {
        skipped.push({ name: file.name, reason: 'duplicate' });
        continue;
      }

      var record;
      try {
        record = await buildRecord(file);
      } catch (e) {
        skipped.push({ name: file.name, reason: 'unreadable' });
        continue;
      }

      try {
        await withStores([TRACK_STORE, COVER_STORE], 'readwrite', function (s) {
          if (record.cover) {
            s[COVER_STORE].put({ key: record.coverKey, mime: record.cover.type, blob: record.cover });
          }
          s[TRACK_STORE].put(record);
        });
      } catch (e) {
        var reason = e && e.name === 'QuotaExceededError' ? 'quota' : 'write';
        skipped.push({ name: file.name, reason: reason });
        if (reason === 'quota') break;   // no point continuing once storage is full
        continue;
      }

      seenThisRun.add(fp);
      added.push(record);
    }

    if (onProgress) onProgress(files.length, files.length, '');
    return { added: added, skipped: skipped };
  }

  function getAllTracks() {
    return withStores([TRACK_STORE], 'readonly', function (s) {
      return readAll(s[TRACK_STORE]);
    });
  }

  function getCover(key) {
    if (!key) return Promise.resolve(null);
    return withStores([COVER_STORE], 'readonly', function (s) {
      return promisify(s[COVER_STORE].get(key));
    }).then(function (row) { return row ? row.blob : null; });
  }

  function deleteTrack(trackUid) {
    return withStores([TRACK_STORE], 'readwrite', function (s) {
      s[TRACK_STORE].delete(trackUid);
    });
  }

  function updateTrack(trackUid, patch) {
    return withStores([TRACK_STORE], 'readwrite', function (s) {
      return promisify(s[TRACK_STORE].get(trackUid)).then(function (record) {
        if (!record) return;
        Object.assign(record, patch);
        s[TRACK_STORE].put(record);
      });
    });
  }

  function clearAll() {
    return withStores([TRACK_STORE, COVER_STORE], 'readwrite', function (s) {
      s[TRACK_STORE].clear();
      s[COVER_STORE].clear();
    });
  }

  /* Orphaned covers (album art left behind by deleted songs) are wasted space. */
  function pruneCovers() {
    return withStores([TRACK_STORE, COVER_STORE], 'readwrite', function (s, tx) {
      return readAll(s[TRACK_STORE]).then(function (tracks) {
        var used = new Set();
        tracks.forEach(function (t) { if (t.coverKey) used.add(t.coverKey); });
        return readAll(s[COVER_STORE]).then(function (covers) {
          var removed = 0;
          covers.forEach(function (c) {
            if (!used.has(c.key)) { s[COVER_STORE].delete(c.key); removed++; }
          });
          return removed;
        });
      });
    });
  }

  /** Ask the browser to keep this data and report what we are using. */
  async function storageInfo() {
    var out = { persisted: false, usage: 0, quota: 0, supported: false };
    if (!global.navigator || !navigator.storage) return out;
    out.supported = true;
    try {
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      if (navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        out.usage = est.usage || 0;
        out.quota = est.quota || 0;
      }
    } catch (e) { /* report what we have */ }
    return out;
  }

  async function requestPersistence() {
    if (!global.navigator || !navigator.storage || !navigator.storage.persist) return false;
    try { return await navigator.storage.persist(); } catch (e) { return false; }
  }

  global.SpideyDB = {
    open: open,
    addTracks: addTracks,
    getAllTracks: getAllTracks,
    getCover: getCover,
    deleteTrack: deleteTrack,
    updateTrack: updateTrack,
    clearAll: clearAll,
    pruneCovers: pruneCovers,
    storageInfo: storageInfo,
    requestPersistence: requestPersistence,
    cleanFilename: cleanFilename,
    fingerprint: fingerprint
  };
})(window);
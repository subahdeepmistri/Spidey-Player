/*
 * id3.js — dependency-free audio metadata reader.
 *
 * Reads ID3v2.2 / v2.3 / v2.4 text frames and attached picture (cover art),
 * FLAC Vorbis comments + PICTURE blocks, and falls back to ID3v1.
 *
 * Only the tag region of a file is read, never the whole audio stream, so this
 * is cheap even for large libraries. Cover art is returned as raw bytes; the
 * caller decides whether to turn it into a Blob / object URL.
 */
(function (global) {
  'use strict';

  var MAX_TAG_BYTES = 20 * 1024 * 1024;   // refuse absurd tag sizes
  var MAX_COVER_BYTES = 12 * 1024 * 1024; // refuse absurd cover sizes

  /* ------------------------------------------------------------------ *
   * byte helpers
   * ------------------------------------------------------------------ */

  function syncsafe(bytes, at) {
    return ((bytes[at] & 0x7f) << 21) |
           ((bytes[at + 1] & 0x7f) << 14) |
           ((bytes[at + 2] & 0x7f) << 7) |
           (bytes[at + 3] & 0x7f);
  }

  function be32(bytes, at) {
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) |
            (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  }

  function be24(bytes, at) {
    return (bytes[at] << 16) | (bytes[at + 1] << 8) | bytes[at + 2];
  }

  function latin1(bytes, at, len) {
    var s = '';
    for (var i = at; i < at + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }

  /* Decode an ID3 text payload given its declared encoding byte. */
  function decodeText(bytes, encoding) {
    if (!bytes || !bytes.length) return '';
    var enc = 'utf-8';
    var slice = bytes;

    if (encoding === 0) {
      enc = 'iso-8859-1';
    } else if (encoding === 1) {
      // UTF-16 with BOM
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        enc = 'utf-16le'; slice = bytes.subarray(2);
      } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        enc = 'utf-16be'; slice = bytes.subarray(2);
      } else {
        enc = 'utf-16le';
      }
    } else if (encoding === 2) {
      enc = 'utf-16be';
    }

    var text;
    try {
      text = new TextDecoder(enc).decode(slice);
    } catch (e) {
      return '';
    }
    // ID3v2.4 allows multiple values separated by NUL; take the first, and
    // strip trailing/leading terminators and whitespace.
    var first = text.split('\u0000')[0];
    return first.replace(/^\u0000+/, '').trim();
  }

  /* Undo ID3v2 unsynchronisation (0xFF 0x00 -> 0xFF). */
  function deunsync(bytes) {
    var out = new Uint8Array(bytes.length);
    var j = 0;
    for (var i = 0; i < bytes.length; i++) {
      out[j++] = bytes[i];
      if (bytes[i] === 0xff && bytes[i + 1] === 0x00) i++;
    }
    return out.subarray(0, j);
  }

  /* ------------------------------------------------------------------ *
   * ID3v2
   * ------------------------------------------------------------------ */

  var FRAME_ALIASES = {
    TT2: 'title', TP1: 'artist', TAL: 'album', TRK: 'track',
    TYE: 'year', TCO: 'genre', PIC: 'picture',
    TIT2: 'title', TPE1: 'artist', TALB: 'album', TRCK: 'track',
    TYER: 'year', TDRC: 'year', TCON: 'genre', APIC: 'picture'
  };

  /* Split a null-terminated string out of `bytes` starting at `at`.
     Returns [string, nextOffset]. UTF-16 terminators are two bytes. */
  function readTerminated(bytes, at, wide) {
    var start = at;
    if (wide) {
      while (at + 1 < bytes.length && !(bytes[at] === 0 && bytes[at + 1] === 0)) at += 2;
      var str = decodeText(bytes.subarray(start, at), 1);
      return [str, Math.min(at + 2, bytes.length)];
    }
    while (at < bytes.length && bytes[at] !== 0) at++;
    var str2 = decodeText(bytes.subarray(start, at), 0);
    return [str2, Math.min(at + 1, bytes.length)];
  }

  function parsePicture(data) {
    if (!data.length) return null;
    var enc = data[0];
    var wide = enc === 1 || enc === 2;
    var at = 1;
    var mime;

    // ID3v2.2 PIC frames store a 3-character image format ("JPG"/"PNG")
    // instead of a null-terminated MIME string. Parenthesised: && binds
    // tighter than ||, so the old spelling matched PIC headers by accident.
    if (data.length > 4 && (latin1(data, at, 3) === 'JPG' || latin1(data, at, 3) === 'PNG')) {
      var fmt = latin1(data, at, 3).toUpperCase();
      mime = fmt === 'PNG' ? 'image/png' : 'image/jpeg';
      at += 3;
    } else {
      var m = readTerminated(data, at, false);
      mime = m[0] || 'image/jpeg';
      at = m[1];
    }

    at += 1; // picture type byte
    if (at >= data.length) return null;
    var desc = readTerminated(data, at, wide);
    at = desc[1];

    if (at >= data.length) return null;
    var bytes = data.subarray(at);
    if (!bytes.length || bytes.length > MAX_COVER_BYTES) return null;
    return { mime: mime || 'image/jpeg', bytes: bytes };
  }

  function parseID3v2(buf, flags) {
    var major = buf[3];
    var body = buf.subarray(10);

    if (flags & 0x80) body = deunsync(body);

    // Extended header
    if (flags & 0x40) {
      if (major === 4) {
        var extSize = syncsafe(body, 0);
        body = body.subarray(extSize > 0 && extSize <= body.length ? extSize : 6);
      } else {
        var extSize3 = be32(body, 0);
        var skip = 4 + extSize3;
        body = body.subarray(skip <= body.length ? skip : 0);
      }
    }

    var out = {};
    var i = 0;
    var headerLen = major === 2 ? 6 : 10;

    while (i + headerLen <= body.length) {
      var id, size;
      if (major === 2) {
        id = latin1(body, i, 3);
        size = be24(body, i + 3);
      } else {
        id = latin1(body, i, 4);
        size = major === 4 ? syncsafe(body, i + 4) : be32(body, i + 4);
      }

      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;      // padding / garbage
      if (size <= 0 || i + headerLen + size > body.length) break;

      var data = body.subarray(i + headerLen, i + headerLen + size);
      var key = FRAME_ALIASES[id];

      if (key === 'picture') {
        if (!out.cover) out.cover = parsePicture(data);
      } else if (key && data.length > 1) {
        var value = decodeText(data.subarray(1), data[0]);
        if (value && !out[key]) out[key] = value;
      }

      i += headerLen + size;
    }

    return out;
  }

  /* ------------------------------------------------------------------ *
   * ID3v1 (last 128 bytes)
   * ------------------------------------------------------------------ */

  function parseID3v1(tail) {
    if (tail.length < 128 || latin1(tail, 0, 3) !== 'TAG') return null;
    function field(at, len) {
      return latin1(tail, at, len).replace(/\u0000.*$/, '').trim();
    }
    var out = {
      title: field(3, 30),
      artist: field(33, 30),
      album: field(63, 30),
      year: field(93, 4)
    };
    // ID3v1.1 stores the track number in the last two comment bytes
    if (tail[125] === 0 && tail[126] !== 0) out.track = String(tail[126]);
    Object.keys(out).forEach(function (k) { if (!out[k]) delete out[k]; });
    return Object.keys(out).length ? out : null;
  }

  /* ------------------------------------------------------------------ *
   * FLAC (Vorbis comments + PICTURE metadata blocks)
   * ------------------------------------------------------------------ */

  function parseFlac(bytes) {
    var at = 4; // skip "fLaC"
    var out = {};
    var last = false;

    while (!last && at + 4 <= bytes.length) {
      var header = bytes[at];
      last = (header & 0x80) !== 0;
      var type = header & 0x7f;
      var len = be24(bytes, at + 1);
      var start = at + 4;
      var end = start + len;
      if (end > bytes.length) break;

      if (type === 4) {                     // VORBIS_COMMENT
        var p = start;
        var vendorLen = (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0;
        p += 4 + vendorLen;
        if (p + 4 <= end) {
          var count = (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0;
          p += 4;
          for (var c = 0; c < count && p + 4 <= end; c++) {
            var clen = (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0;
            p += 4;
            if (clen <= 0 || p + clen > end) break;
            var pair = new TextDecoder('utf-8').decode(bytes.subarray(p, p + clen));
            p += clen;
            var eq = pair.indexOf('=');
            if (eq < 1) continue;
            var k = pair.slice(0, eq).toUpperCase();
            var v = pair.slice(eq + 1).trim();
            if (!v) continue;
            if (k === 'TITLE' && !out.title) out.title = v;
            else if (k === 'ARTIST' && !out.artist) out.artist = v;
            else if (k === 'ALBUM' && !out.album) out.album = v;
            else if (k === 'TRACKNUMBER' && !out.track) out.track = v;
            else if (k === 'DATE' && !out.year) out.year = v.slice(0, 4);
          }
        }
      } else if (type === 6) {              // PICTURE
        var q = start;
        q += 4;                             // picture type
        if (q + 4 > end) break;
        var mimeLen = be32(bytes, q); q += 4;
        if (q + mimeLen > end) break;
        var mime = latin1(bytes, q, mimeLen); q += mimeLen;
        if (q + 4 > end) break;
        var descLen = be32(bytes, q); q += 4 + descLen;
        if (q + 16 > end) break;
        q += 16;                            // width, height, depth, colours
        if (q + 4 > end) break;
        var dataLen = be32(bytes, q); q += 4;
        if (dataLen > 0 && dataLen <= MAX_COVER_BYTES && q + dataLen <= bytes.length && !out.cover) {
          out.cover = { mime: mime || 'image/jpeg', bytes: bytes.subarray(q, q + dataLen) };
        }
      }

      at = end;
    }

    return out;
  }

  /* ------------------------------------------------------------------ *
   * public API
   * ------------------------------------------------------------------ */

  function sliceBuffer(file, start, end) {
    return file.slice(start, end).arrayBuffer();
  }

  /**
   * Read metadata from a File/Blob.
   * Resolves to { title, artist, album, track, year, cover } — any field may
   * be absent. Never rejects: a corrupt tag yields an empty object.
   */
  function readMetadata(file) {
    return (async function () {
      if (!file || typeof file.slice !== 'function') return {};

      var head;
      try {
        head = new Uint8Array(await sliceBuffer(file, 0, 10));
      } catch (e) {
        return {};
      }

      // --- ID3v2
      if (head.length >= 10 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
        var tagSize = syncsafe(head, 6);
        var total = 10 + tagSize;
        if (tagSize > 0 && total <= MAX_TAG_BYTES && total <= file.size) {
          try {
            var buf = new Uint8Array(await sliceBuffer(file, 0, total));
            var v2 = parseID3v2(buf, head[5]);
            if (Object.keys(v2).length) return v2;
          } catch (e) { /* fall through to ID3v1 */ }
        }
      }

      // --- FLAC
      if (head.length >= 4 && head[0] === 0x66 && head[1] === 0x4c &&
          head[2] === 0x61 && head[3] === 0x43) {
        try {
          var flacBuf = new Uint8Array(await sliceBuffer(file, 0, Math.min(file.size, MAX_TAG_BYTES)));
          var flac = parseFlac(flacBuf);
          if (Object.keys(flac).length) return flac;
        } catch (e) { /* fall through */ }
      }

      // --- ID3v1
      if (file.size > 128) {
        try {
          var tail = new Uint8Array(await sliceBuffer(file, file.size - 128, file.size));
          var v1 = parseID3v1(tail);
          if (v1) return v1;
        } catch (e) { /* nothing left to try */ }
      }

      return {};
    })();
  }

  /**
   * Resolve a track's duration in seconds by decoding only its header.
   * Resolves to NaN when the browser cannot decode the file.
   */
  function readDuration(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var probe = new Audio();
      var done = false;

      function finish(value) {
        if (done) return;
        done = true;
        probe.removeAttribute('src');
        probe.load();
        URL.revokeObjectURL(url);
        resolve(value);
      }

      var timer = setTimeout(function () { finish(NaN); }, 15000);

      probe.preload = 'metadata';
      probe.addEventListener('loadedmetadata', function () {
        clearTimeout(timer);
        finish(Number.isFinite(probe.duration) ? probe.duration : NaN);
      });
      probe.addEventListener('error', function () { clearTimeout(timer); finish(NaN); });
      probe.src = url;
    });
  }

  global.SpideyID3 = { readMetadata: readMetadata, readDuration: readDuration };
})(window);

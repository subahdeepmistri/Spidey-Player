/*
 * app.js — Spidey Player 2.0
 *
 * A cyber-glass web music player. The library lives in IndexedDB (see db.js);
 * tag reading lives in id3.js.
 *
 * Architectural notes worth keeping in mind when editing:
 *   - There is exactly ONE requestAnimationFrame render loop for the whole
 *     app. It is started on demand and stopped once the bars have decayed.
 *     Scheduling a loop from the audio 'play' event leaks a new loop per
 *     track change, so never do that.
 *   - Playback state is derived from the audio element's own events. Never
 *     flip a boolean by hand and assume it matches the element.
 *   - Object URLs are created in one place (objectUrls registry) and revoked
 *     before being replaced.
 *   - Every DOM write of user-controlled text goes through textContent.
 */
(function () {
  'use strict';

  /* ================================================================== *
   * Constants
   * ================================================================== */

  var REPEAT_OFF = 'off';
  var REPEAT_ALL = 'all';
  var REPEAT_ONE = 'one';

  var PREF_KEY = 'spidey.prefs.v1';
  var SEEK_STEP = 5;              // seconds per arrow-key press
  var AUDIO_EXT = /\.(mp3|flac|m4a|aac|wav|ogg|oga|opus|webm)$/i;

  /* ================================================================== *
   * State
   * ================================================================== */

  var audio = new Audio();
  audio.preload = 'metadata';

  var tracks = [];          // library records from IndexedDB
  var currentTrack = -1;    // index into tracks, -1 when nothing is loaded
  var order = [];           // playback order (identity when shuffle is off)
  var orderPos = -1;        // position of currentTrack within order

  var isPlaying = false;
  var isShuffle = false;
  var repeatMode = REPEAT_OFF;

  var trackUrl = null;      // object URL for the currently loaded audio
  var dragDepth = 0;        // dragenter/dragleave counter
  var scrubbing = false;
  var rafId = null;
  var idleFrames = 0;

  /* ================================================================== *
   * DOM
   * ================================================================== */

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    play: $('play-btn'),
    prev: $('prev-btn'),
    next: $('next-btn'),
    shuffle: $('shuffle-btn'),
    repeat: $('repeat-btn'),
    mute: $('mute-btn'),
    volume: $('volume'),
    progress: $('progress-container'),
    progressBar: $('progress-bar'),
    currentTime: $('current-time'),
    duration: $('duration'),
    title: $('song-title'),
    artist: $('song-artist'),
    album: $('song-album'),
        playlist: $('playlist'),
        panel: $('playlist-panel'),
        panelToggle: $('playlist-toggle-btn'),
        panelClose: $('panel-close-btn'),
        panelBackdrop: $('panel-backdrop'),
        art: $('album-art'),
        fileInput: $('file-input'),
        search: $('search-input'),
        canvas: $('visualizer'),
        toasts: $('toasts'),
        srStatus: $('sr-status'),
    dropOverlay: $('drop-overlay'),
    trackCount: $('track-count'),
    storageUsage: $('storage-usage'),
    importStatus: $('import-status')
  };

  var ctx2d = el.canvas.getContext('2d');

  /* ================================================================== *
   * Small utilities
   * ================================================================== */

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    var total = Math.floor(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    var value = bytes;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return (value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)) + ' ' + units[i];
  }

  /* Announce to screen readers without stealing focus. */
  function announce(message) {
    el.srStatus.textContent = '';
    // A microtask gap makes repeat messages get re-announced.
    setTimeout(function () { el.srStatus.textContent = message; }, 30);
  }

  var TOAST_ICONS = {
      success: 'circle-check',
      error: 'triangle-exclamation',
      info: 'circle-info',
      warn: 'circle-exclamation'
    };

    /* Inline SVG icon helper — replaces Font Awesome dependency. */
    function createIcon(name, size) {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', size || '1em');
      svg.setAttribute('height', size || '1em');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      var paths = {
        'list': 'M3 12h18M3 6h18M3 18h16',
        'play': 'M5 3l14 9-14 9V3z',
        'pause': 'M6 4h4v16H6V4zm8 0h4v16h-4V4z',
        'volume-high': 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07',
        'volume-xmark': 'M11 5L6 9H2v6h4l5 4V5z',
        'volume-off': 'M11 5L6 9H2v6h4l5 4V5z',
        'volume-low': 'M11 5L6 9H2v6h4l5 4V5z',
        'random': 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM20 12v-2l-4-4v6l4-4v2',
        'step-backward': 'M19 20H9l-7-7 7-7h10v14zM3 12h18',
        'step-forward': 'M5 4v16l7-7-7-7V4h10v14zM21 12H3',
        'redo': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
        'repeat-1': 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
        'plus': 'M12 5v14M5 12h14',
        'times': 'M18 6L6 18M6 6l12 12',
        'search': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        'xmark': 'M18 6L6 18M6 6l12 12',
        'file-arrow-down': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 12v4M10 14h4M16 14h-4',
        'magnifying-glass': 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
        'music': 'M9 18V5l12-2v13M9 9h12v2H9V9z',
        'circle-check': 'M22 11.08V12a10 10 0 11-5.93-9.14M9 11l3 3L22 4',
        'triangle-exclamation': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
        'circle-info': 'M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zM12 16v-4M12 8h.01',
        'circle-exclamation': 'M12 22C6.48 22 2 17.52 2 12S6.48 2 12 2s10 4.48 10 10-4.48 10-10 10zM12 8v4M12 16h.01'
      };

      if (paths[name]) {
        path.setAttribute('d', paths[name]);
      }
      svg.appendChild(path);
      return svg;
    }

    function toast(message, type, timeout) {
        type = type || 'info';
        var node = document.createElement('div');
        node.className = 'toast toast-' + type;

        var icon = createIcon(TOAST_ICONS[type] || TOAST_ICONS.info);
        icon.setAttribute('aria-hidden', 'true');

        var span = document.createElement('span');
        span.textContent = message;          // never innerHTML: message may be a filename

        var close = document.createElement('button');
        close.className = 'toast-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.appendChild(createIcon('xmark', '0.875em'));

        node.appendChild(icon);
        node.appendChild(span);
        node.appendChild(close);
        el.toasts.appendChild(node);

    var removed = false;
    function dismiss() {
      if (removed) return;
      removed = true;
      node.classList.add('toast-out');
      node.addEventListener('transitionend', function () { node.remove(); }, { once: true });
      setTimeout(function () { if (node.isConnected) node.remove(); }, 500);
    }

    close.addEventListener('click', dismiss);
    if (timeout !== 0) setTimeout(dismiss, timeout || (type === 'error' ? 8000 : 4000));
    return dismiss;
  }

  /* Persisted user preferences. */
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        volume: audio.volume,
        muted: audio.muted,
        shuffle: isShuffle,
        repeat: repeatMode
      }));
    } catch (e) { /* private mode: preferences simply do not persist */ }
  }
  function loadPrefs() {
    var prefs;
    try {
      prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {};
    } catch (e) {
      prefs = {};
    }
    if (typeof prefs.volume === 'number' && prefs.volume >= 0 && prefs.volume <= 1) {
      audio.volume = prefs.volume;
    }
    audio.muted = !!prefs.muted;
    isShuffle = !!prefs.shuffle;
    if (prefs.repeat === REPEAT_ALL || prefs.repeat === REPEAT_ONE) repeatMode = prefs.repeat;
  }

  /* ================================================================== *
   * Object URL registry — one place that creates, and always revokes
   * ================================================================== */

  /*
   * Swap the audio element onto a new blob URL.
   *
   * Order matters: the element must be detached from the previous source
   * BEFORE that source is revoked. Revoking a URL the element is still
   * fetching produces a spurious net::ERR_FILE_NOT_FOUND in the console and
   * can truncate playback.
   */
  function setTrackUrl(blob) {
    if (trackUrl) {
      audio.removeAttribute('src');
      audio.load();                      // aborts any in-flight load
      URL.revokeObjectURL(trackUrl);
      trackUrl = null;
    }
    if (!blob) return null;
    trackUrl = URL.createObjectURL(blob);
    return trackUrl;
  }

  /*
   * Cover art object URLs.
   *
   * Covers are de-duplicated in IndexedDB by a content hash, so the number of
   * distinct images is one per album — small and bounded. We therefore cache
   * the object URL per cover key and reuse it instead of creating and revoking
   * a URL on every track change.
   *
   * Revoking eagerly is what caused "Failed to load resource:
   * net::ERR_FILE_NOT_FOUND" in the console: the <img> still had an in-flight
   * request for the outgoing URL when it was revoked. Caching sidesteps the
   * race entirely, and eviction only happens once the cache exceeds
   * COVER_CACHE_MAX, long after the image has painted.
   */
  var COVER_CACHE_MAX = 24;
  var coverCache = new Map();      // coverKey -> object URL (insertion order = LRU)

  function coverUrlFor(key, blob) {
    if (coverCache.has(key)) {
      // Refresh recency.
      var existing = coverCache.get(key);
      coverCache.delete(key);
      coverCache.set(key, existing);
      return existing;
    }
    var url = URL.createObjectURL(blob);
    coverCache.set(key, url);
    while (coverCache.size > COVER_CACHE_MAX) {
      var oldestKey = coverCache.keys().next().value;
      URL.revokeObjectURL(coverCache.get(oldestKey));
      coverCache.delete(oldestKey);
    }
    return url;
  }

  function applyCover(blob, key) {
    if (!blob) {
      el.art.src = DEFAULT_ART;
      return null;
    }
    var url = coverUrlFor(key || 'inline', blob);
    el.art.src = url;
    return url;
  }

  var DEFAULT_ART = 'image/862eb376cc18fd124f045f6b31b0dc4b.jpg';

  /* ================================================================== *
   * Playback order (shuffle-aware, history-preserving)
   * ================================================================== */

  function buildOrder(keepCurrent) {
    var indices = [];
    for (var i = 0; i < tracks.length; i++) indices.push(i);

    if (!isShuffle) {
      order = indices;
    } else {
      // Fisher-Yates, then pin the current track to the front so toggling
      // shuffle does not interrupt what is playing.
      for (var j = indices.length - 1; j > 0; j--) {
        var k = Math.floor(Math.random() * (j + 1));
        var tmp = indices[j]; indices[j] = indices[k]; indices[k] = tmp;
      }
      if (keepCurrent && currentTrack >= 0) {
        var at = indices.indexOf(currentTrack);
        if (at > 0) { indices.splice(at, 1); indices.unshift(currentTrack); }
      }
      order = indices;
    }
    orderPos = currentTrack >= 0 ? order.indexOf(currentTrack) : -1;
  }

  function step(delta) {
    if (!order.length) return -1;

    if (orderPos < 0) return order[0];

    var next = orderPos + delta;

    if (next >= order.length) {
      if (repeatMode === REPEAT_ALL) return order[0];
      return -1;                       // end of queue
    }
    if (next < 0) {
      if (repeatMode === REPEAT_ALL) return order[order.length - 1];
      return order[0];                 // pressing back from the top restarts
    }
    return order[next];
  }

  /* ================================================================== *
   * Audio context + visualizer
   * ================================================================== */

  var audioContext = null;
  var analyser = null;
  var sourceNode = null;
  var freqData = null;

  /* Creating the AudioContext re-routes the element's output through the
     graph, so it must happen exactly once per element. */
  function ensureAudioGraph() {
    if (audioContext) {
      if (audioContext.state === 'suspended') audioContext.resume().catch(function () {});
      return true;
    }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;

    try {
      audioContext = new Ctor();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      sourceNode = audioContext.createMediaElementSource(audio);
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);

      freqData = new Uint8Array(analyser.frequencyBinCount);
      return true;
    } catch (e) {
      // Visualizer is a progressive enhancement; playback must still work.
      audioContext = null;
      analyser = null;
      return false;
    }
  }

  var viewW = 0;
  var viewH = 0;

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = el.canvas.clientWidth || window.innerWidth;
    var h = el.canvas.clientHeight || window.innerHeight;

    viewW = w;
    viewH = h;
    el.canvas.width = Math.round(w * dpr);
    el.canvas.height = Math.round(h * dpr);
    // Draw in CSS pixels; the transform handles the device scale.
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function startLoop() {
    if (rafId !== null) return;        // a loop is already running
    idleFrames = 0;
    rafId = requestAnimationFrame(renderFrame);
  }

  function stopLoop() {
    if (rafId === null) return;
    cancelAnimationFrame(rafId);
    rafId = null;
    ctx2d.clearRect(0, 0, viewW, viewH);
    el.art.style.transform = '';
  }

  function renderFrame() {
    rafId = requestAnimationFrame(renderFrame);

    if (!analyser || !freqData) return;

    analyser.getByteFrequencyData(freqData);

    var sum = 0;
    for (var i = 0; i < freqData.length; i++) sum += freqData[i];
    var average = sum / freqData.length;

    ctx2d.clearRect(0, 0, viewW, viewH);

    if (average < 0.5) {
      // Silence: let the bars fall to nothing, then stop burning frames.
      idleFrames++;
      if (idleFrames > 45) { stopLoop(); return; }
    } else {
      idleFrames = 0;
    }

    var bars = freqData.length;
    var gap = 1;
    // Bars are sized to exactly fill the canvas, so the strip never runs off
    // the edge (the old formula produced a 2.5x-wide strip that was 62% hidden).
    var barWidth = Math.max(1, viewW / bars - gap);
    var maxBarHeight = viewH * 0.55;

    for (var b = 0; b < bars; b++) {
      var magnitude = freqData[b] / 255;
      var barHeight = magnitude * maxBarHeight;
      var x = b * (barWidth + gap);

      var gradient = ctx2d.createLinearGradient(0, viewH, 0, viewH - barHeight);
      gradient.addColorStop(0, 'rgba(0, 242, 234, 0.08)');
      gradient.addColorStop(0.55, 'rgba(0, 242, 234, 0.45)');
      gradient.addColorStop(1, 'rgba(255, 0, 85, 0.6)');

      ctx2d.fillStyle = gradient;
      var radius = Math.min(barWidth / 2, 4);
      ctx2d.beginPath();
      ctx2d.roundRect(x, viewH - barHeight, barWidth, barHeight, radius);
      ctx2d.fill();
    }

    // Beat-reactive album art. The scale is applied to the img; the idle CSS
    // pulse lives on the wrapper, so the two never fight.
    var target = 1 + (average / 255) * 0.06;
    el.art.style.transform = 'scale(' + target.toFixed(3) + ')';
  }

  /* ================================================================== *
   * Playback state
   * ================================================================== */

  function updatePlayButton() {
      var icon = el.play.querySelector('svg');
      if (icon) {
        var path = icon.querySelector('path');
        if (path) {
          path.setAttribute('d', isPlaying ? 'M6 4h4v16H6V4zm8 0h4v16h-4V4z' : 'M5 3l14 9-14 9V3z');
        }
      }
      el.play.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    }

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var track = tracks[currentTrack];
    if (!track || !('MediaMetadata' in window)) return;

    var art = el.art.getAttribute('src') || DEFAULT_ART;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || track.name,
        artist: track.artist || 'Spidey Player',
        album: track.album || '',
        artwork: [{ src: art, sizes: '512x512' }]
      });
    } catch (e) { /* non-fatal */ }
  }

  function updateNowPlayingUI() {
    var track = tracks[currentTrack];
    if (!track) {
      el.title.textContent = 'Select a Track';
      el.artist.textContent = 'Spidey Player';
      el.album.textContent = '';
      el.duration.textContent = '0:00';
      el.currentTime.textContent = '0:00';
      setProgressUI(0);
      return;
    }
    el.title.textContent = track.title || track.name;
    el.artist.textContent = track.artist || 'Spidey Player';
    el.album.textContent = track.album || '';
    el.title.title = track.title || track.name;
    document.title = (track.title || track.name) + ' — Spidey Player';

    var known = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : (track.duration || NaN);
    el.duration.textContent = formatTime(known);
    updateProgressUI();
  }

  function setProgressUI(percent) {
    var clamped = Math.max(0, Math.min(100, percent));
    el.progressBar.style.width = clamped + '%';
    el.progress.setAttribute('aria-valuenow', Math.round(clamped));
  }

  function updateProgressUI() {
    var duration = audio.duration;
    var current = audio.currentTime;

    if (Number.isFinite(duration) && duration > 0) {
      setProgressUI((current / duration) * 100);
    } else {
      setProgressUI(0);
    }
    el.currentTime.textContent = formatTime(current);
    if (Number.isFinite(duration) && duration > 0) {
      el.duration.textContent = formatTime(duration);
    }
    el.progress.setAttribute('aria-valuetext',
      formatTime(current) + ' of ' + el.duration.textContent);
  }

  /* Load a track by its index in `tracks`. */
  function loadTrack(index, autoPlay) {
    if (index < 0 || index >= tracks.length) return;
    var track = tracks[index];

    currentTrack = index;
    orderPos = order.indexOf(index);

    var url = setTrackUrl(track.blob);
    if (!url) {
      toast('Could not read "' + (track.title || track.name) + '".', 'error');
      return;
    }

    // Reset the visual progress immediately so a stale bar is never shown
    // while the new file's metadata loads.
    setProgressUI(0);
    el.currentTime.textContent = '0:00';
    el.duration.textContent = formatTime(track.duration);

    audio.src = url;
    audio.load();

    updateNowPlayingUI();
    highlightCurrent();
    updateMediaSession();
    loadCover(track);

    if (autoPlay) {
      play();
    } else {
      updatePlayButton();
    }
  }

  function loadCover(track) {
    if (!track || !track.coverKey) {
      applyCover(null);
      el.art.alt = '';
      return;
    }
    var key = track.coverKey;
    window.SpideyDB.getCover(key).then(function (blob) {
      // Ignore a late response for a track the user already skipped past.
      if (!tracks[currentTrack] || tracks[currentTrack].coverKey !== key) return;
      applyCover(blob || null, key);
      el.art.alt = blob ? 'Cover art for ' + (track.album || track.title || track.name) : '';
      updateMediaSession();
    }).catch(function () {
      applyCover(null);
    });
  }

  function play() {
    if (!tracks.length) {
      toast('Import some songs first.', 'info');
      return;
    }
    if (currentTrack < 0) {
      buildOrder(false);
      loadTrack(order[0], true);
      return;
    }
    ensureAudioGraph();
    var promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (err) {
        if (err && err.name === 'NotAllowedError') {
          toast('Press play to start audio (the browser blocked autoplay).', 'warn');
        } else if (err && err.name !== 'AbortError') {
          toast('Playback failed: ' + err.message, 'error');
        }
      });
    }
  }

  function pause() {
    audio.pause();
  }

  function togglePlay() {
    if (isPlaying) pause(); else play();
  }

  function nextTrack(userInitiated) {
    if (!order.length) return;
    var target = step(1);

    if (target === -1) {
      // End of the queue with repeat off: stop cleanly instead of looping
      // the whole playlist forever.
      pause();
      audio.currentTime = 0;
      if (userInitiated) toast('End of playlist.', 'info', 2500);
      return;
    }
    loadTrack(target, true);
  }

  function prevTrack() {
    if (!order.length) return;
    // Restart the current song first, like every other player does.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    var target = step(-1);
    if (target === -1) return;
    loadTrack(target, true);
  }

  /* ================================================================== *
   * Progress bar: click, drag and keyboard
   * ================================================================== */

  function seekToFraction(fraction) {
    var duration = audio.duration;
    // Guard: assigning a non-finite currentTime throws a DOMException.
    if (!Number.isFinite(duration) || duration <= 0) return;
    if (!Number.isFinite(fraction)) return;
    var target = Math.max(0, Math.min(1, fraction)) * duration;
    try {
      audio.currentTime = target;
    } catch (e) {
      /* seeking can fail on a stream that is not yet seekable */
    }
    updateProgressUI();
  }

  function fractionFromEvent(clientX) {
    var rect = el.progress.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return (clientX - rect.left) / rect.width;
  }

  el.progress.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    scrubbing = true;
    el.progress.setPointerCapture(e.pointerId);
    seekToFraction(fractionFromEvent(e.clientX));
  });

  el.progress.addEventListener('pointermove', function (e) {
    if (!scrubbing) return;
    // Preview the position without committing a seek on every pixel.
    var rect = el.progress.getBoundingClientRect();
    setProgressUI(fractionFromEvent(e.clientX) * 100);
    el.currentTime.textContent = formatTime(fractionFromEvent(e.clientX) * (audio.duration || 0));
  });

  function endScrub(e) {
    if (!scrubbing) return;
    scrubbing = false;
    seekToFraction(fractionFromEvent(e.clientX));
    try { el.progress.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  }
  el.progress.addEventListener('pointerup', endScrub);
  el.progress.addEventListener('pointercancel', endScrub);

  el.progress.addEventListener('keydown', function (e) {
    var duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    var handled = true;

    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp':
        audio.currentTime = Math.min(duration, audio.currentTime + SEEK_STEP); break;
      case 'ArrowLeft': case 'ArrowDown':
        audio.currentTime = Math.max(0, audio.currentTime - SEEK_STEP); break;
      case 'Home':
        audio.currentTime = 0; break;
      case 'End':
        audio.currentTime = Math.max(0, duration - 0.25); break;
      case 'PageUp':
        audio.currentTime = Math.min(duration, audio.currentTime + 30); break;
      case 'PageDown':
        audio.currentTime = Math.max(0, audio.currentTime - 30); break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      updateProgressUI();
    }
  });

  /* ================================================================== *
   * Volume
   * ================================================================== */

  function updateVolumeUI() {
      var icon = el.mute.querySelector('svg');
      if (icon) {
        var path = icon.querySelector('path');
        var level = audio.muted ? 0 : audio.volume;
        var d = level === 0 ? 'M11 5L6 9H2v6h4l5 4V5z'
          : level < 0.34 ? 'M11 5L6 9H2v6h4l5 4V5z'
          : level < 0.67 ? 'M11 5L6 9H2v6h4l5 4V5z'
          : 'M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07';
        if (path) path.setAttribute('d', d);
      }
      el.mute.setAttribute('aria-label', audio.muted || level === 0 ? 'Unmute' : 'Mute');
      el.mute.setAttribute('aria-pressed', String(audio.muted || level === 0));
      if (!scrubbing) el.volume.value = String(audio.muted ? 0 : audio.volume);
    }

  el.volume.addEventListener('input', function () {
    var value = parseFloat(el.volume.value);
    audio.volume = Math.max(0, Math.min(1, value));
    if (audio.volume > 0 && audio.muted) audio.muted = false;
    updateVolumeUI();
    savePrefs();
  });

  el.mute.addEventListener('click', function () {
    audio.muted = !audio.muted;
    // Un-muting a slider that sits at 0 would still be silent; restore level.
    if (!audio.muted && audio.volume === 0) audio.volume = 0.6;
    updateVolumeUI();
    savePrefs();
    announce(audio.muted ? 'Muted' : 'Unmuted');
  });

  /* ================================================================== *
   * Shuffle / repeat
   * ================================================================== */

  function updateShuffleUI() {
    el.shuffle.setAttribute('aria-pressed', String(isShuffle));
    el.shuffle.classList.toggle('is-active', isShuffle);
    el.shuffle.setAttribute('aria-label', isShuffle ? 'Shuffle on' : 'Shuffle off');
  }

  function updateRepeatUI() {
      var icon = el.repeat.querySelector('svg');
      if (icon) {
        var path = icon.querySelector('path');
        var d = repeatMode === REPEAT_ONE ? 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' : 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15';
        if (path) path.setAttribute('d', d);
      }
      var label = repeatMode === REPEAT_OFF ? 'Repeat off'
        : repeatMode === REPEAT_ALL ? 'Repeat all' : 'Repeat one';
      el.repeat.setAttribute('aria-pressed', String(repeatMode !== REPEAT_OFF));
      el.repeat.classList.toggle('is-active', repeatMode !== REPEAT_OFF);
      el.repeat.setAttribute('aria-label', label);
      el.repeat.title = label;
    }

  function toggleShuffle() {
    isShuffle = !isShuffle;
    buildOrder(true);
    updateShuffleUI();
    savePrefs();
    announce(isShuffle ? 'Shuffle on' : 'Shuffle off');
  }

  function cycleRepeat() {
    repeatMode = repeatMode === REPEAT_OFF ? REPEAT_ALL
      : repeatMode === REPEAT_ALL ? REPEAT_ONE
      : REPEAT_OFF;
    updateRepeatUI();
    savePrefs();
    announce(repeatMode === REPEAT_OFF ? 'Repeat off'
      : repeatMode === REPEAT_ALL ? 'Repeat all' : 'Repeat one');
  }

  /* ================================================================== *
   * Playlist rendering
   * ================================================================== */

  function renderPlaylist(filter) {
    var query = (filter || '').trim().toLowerCase();
    el.playlist.textContent = '';       // clears children safely

    if (!tracks.length) {
      el.playlist.appendChild(emptyState(
              'music', 'Drag & Drop songs here', 'or click Import'));
      updateCounts(0, 0);
      return;
    }

    var visible = 0;
    var fragment = document.createDocumentFragment();

    tracks.forEach(function (track, index) {
      if (query) {
        var haystack = [track.title, track.artist, track.album, track.name]
          .filter(Boolean).join(' ').toLowerCase();
        if (haystack.indexOf(query) === -1) return;
      }
      visible++;
      fragment.appendChild(playlistRow(track, index));
    });

    if (visible === 0) {
      el.playlist.appendChild(emptyState(
              'search', 'No songs match "' + (filter || '') + '"', 'Try a different search'));
    }

    el.playlist.appendChild(fragment);
    updateCounts(visible, tracks.length);
  }

  function emptyState(iconName, line1, line2) {
      var wrap = document.createElement('li');
      wrap.className = 'text-center text-gray-500 mt-10 text-sm list-none';

      var svg = createIcon(iconName || 'music', '2rem');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.opacity = '0.5';

      var p1 = document.createElement('p');
      p1.textContent = line1;

      var p2 = document.createElement('p');
      p2.className = 'text-xs mt-1';
      p2.textContent = line2;

      wrap.appendChild(svg);
      wrap.appendChild(p1);
      wrap.appendChild(p2);
      return wrap;
    }

  function playlistRow(track, index) {
      var li = document.createElement('li');
      li.className = 'track-row group';
      if (index === currentTrack) li.classList.add('is-current');

      var num = document.createElement('span');
      num.className = 'track-num';
      num.textContent = index === currentTrack && isPlaying ? '' : String(index + 1);
      if (index === currentTrack && isPlaying) {
        num.appendChild(playingIndicator());
      }

      var body = document.createElement('div');
      body.className = 'track-body';

      var title = document.createElement('p');
      title.className = 'track-title';
      // textContent, not innerHTML: a filename is attacker-influenced input
      // (a dropped file can be named `<img onerror=...>`).
      title.textContent = track.title || track.name;
      title.title = track.title || track.name;

      var sub = document.createElement('p');
      sub.className = 'track-sub';
      sub.textContent = [track.artist, track.album].filter(Boolean).join(' • ') ||
        window.SpideyDB.cleanFilename(track.name);

      body.appendChild(title);
      body.appendChild(sub);

      var time = document.createElement('span');
      time.className = 'track-time';
      time.textContent = Number.isFinite(track.duration) && track.duration > 0
        ? formatTime(track.duration) : '';

      var mainBtn = document.createElement('button');
      mainBtn.className = 'track-main';
      mainBtn.type = 'button';
      var trackName = track.title || track.name;
      mainBtn.setAttribute('aria-label', (index === currentTrack ? 'Pause' : 'Play') + ' ' + trackName);
      mainBtn.appendChild(num);
      mainBtn.appendChild(body);
      mainBtn.appendChild(time);
      mainBtn.addEventListener('click', function () {
        if (index === currentTrack) { togglePlay(); return; }
        loadTrack(index, true);
      });
      mainBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          mainBtn.click();
        }
      });

      var remove = document.createElement('button');
            remove.className = 'track-remove';
            remove.type = 'button';
            remove.setAttribute('aria-label', 'Remove ' + trackName + ' from library');
            remove.appendChild(createIcon('xmark'));
            remove.addEventListener('click', function (e) {
              e.stopPropagation();
              removeTrack(index);
            });

      li.appendChild(mainBtn);
      li.appendChild(remove);

      return li;
    }

  function playingIndicator() {
    var box = document.createElement('span');
    box.className = 'playing-indicator';
    for (var i = 0; i < 3; i++) box.appendChild(document.createElement('span'));
    return box;
  }

  function updateCounts(visible, total) {
    if (total === 0) {
      el.trackCount.textContent = '0 tracks';
    } else if (visible === total) {
      el.trackCount.textContent = total + (total === 1 ? ' track' : ' tracks');
    } else {
      el.trackCount.textContent = visible + ' of ' + total + ' tracks';
    }
  }

  function highlightCurrent() {
    // A full re-render is the simplest correct approach: the row's number,
    // indicator and title styling all depend on currentTrack AND isPlaying.
    // The library is small enough that this stays well under a frame.
    renderPlaylist(el.search.value);
  }

  /* ================================================================== *
   * Library mutations
   * ================================================================== */

  function removeTrack(index) {
      var track = tracks[index];
      if (!track) return;

      window.SpideyDB.deleteTrack(track.uid).then(function () {
        var wasCurrent = index === currentTrack;
        tracks.splice(index, 1);

        if (wasCurrent) {
          pause();
          setTrackUrl(null);
          audio.removeAttribute('src');
          currentTrack = tracks.length ? Math.min(index, tracks.length - 1) : -1;
          if (currentTrack >= 0) loadTrack(currentTrack, false);
          else updateNowPlayingUI();
        } else if (index < currentTrack) {
          currentTrack--;
        }

        buildOrder(true);
        renderPlaylist(el.search.value);
        refreshStorage();
        // Prune orphaned covers after successful deletion
        window.SpideyDB.pruneCovers().catch(function (err) {
          console.warn('Failed to prune covers:', err);
        });
        toast('Removed "' + (track.title || track.name) + '".', 'info', 3000);
      }).catch(function (err) {
        toast('Could not remove the track: ' + err.message, 'error');
      });
    }

  /* ================================================================== *
   * Import
   * ================================================================== */

  function isAudio(file) {
    if (file.type && file.type.indexOf('audio/') === 0) return true;
    // Some browsers report an empty type for .flac / .opus
    return AUDIO_EXT.test(file.name || '');
  }

  function importFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    var audioFiles = files.filter(isAudio);
    var rejected = files.length - audioFiles.length;

    if (!audioFiles.length) {
      toast('No audio files found. Supported: mp3, flac, m4a, wav, ogg, opus.', 'warn');
      return;
    }
    if (rejected > 0) {
      toast('Skipped ' + rejected + ' non-audio ' + (rejected === 1 ? 'file' : 'files') + '.', 'warn');
    }

    var total = audioFiles.length;
    var progressToast = toast('Importing 0/' + total + '…', 'info', 0);

    window.SpideyDB.addTracks(audioFiles, function (done, count, name) {
      if (name) {
        el.importStatus.textContent = 'Reading ' + (done + 1) + '/' + count + ': ' + name;
      } else {
        el.importStatus.textContent = '';
      }
    }).then(function (result) {
      progressToast();
      el.importStatus.textContent = '';

      return reloadLibrary().then(function () {
        var added = result.added.length;
        var skipped = result.skipped;

        if (added) {
          toast('Added ' + added + ' ' + (added === 1 ? 'song' : 'songs') + '.', 'success');
        }

        if (skipped.length) {
          var byReason = skipped.reduce(function (acc, s) {
            acc[s.reason] = (acc[s.reason] || 0) + 1;
            return acc;
          }, {});

          if (byReason.duplicate) {
            toast(byReason.duplicate + ' already in your library (same file).', 'info', 5000);
          }
          if (byReason.quota) {
            toast('Browser storage is full — the rest could not be saved.', 'error', 0);
          }
          if (byReason.unreadable) {
            toast(byReason.unreadable + ' could not be read.', 'error');
          }
          if (byReason.write) {
            toast(byReason.write + ' failed to save.', 'error');
          }
        }

        if (!added && !skipped.length) toast('Nothing to import.', 'info');
        refreshStorage();
      });
    }).catch(function (err) {
      progressToast();
      el.importStatus.textContent = '';
      toast('Import failed: ' + err.message, 'error', 0);
    });
  }

  function reloadLibrary() {
    return window.SpideyDB.getAllTracks().then(function (rows) {
      var playingUid = currentTrack >= 0 && tracks[currentTrack] ? tracks[currentTrack].uid : null;

      tracks = (rows || []).sort(function (a, b) {
        // Preserve import order; fall back to title for legacy rows.
        return (a.addedAt || 0) - (b.addedAt || 0);
      });

      if (playingUid) {
        var at = tracks.findIndex(function (t) { return t.uid === playingUid; });
        currentTrack = at;
      } else if (currentTrack >= tracks.length) {
        currentTrack = tracks.length - 1;
      }

      buildOrder(true);
      renderPlaylist(el.search.value);

      if (currentTrack < 0 && tracks.length) {
        // First import: queue up the opening track without forcing playback.
        loadTrack(0, false);
      }
      return tracks;
    });
  }

  function refreshStorage() {
    window.SpideyDB.storageInfo().then(function (info) {
      if (!info.supported) { el.storageUsage.textContent = ''; return; }
      var parts = [];
      if (info.usage) parts.push(formatBytes(info.usage) + ' used');
      if (info.quota) parts.push(formatBytes(info.quota) + ' available');
      el.storageUsage.textContent = parts.join(' · ');
    }).catch(function () { /* informational only */ });
  }

  /* ================================================================== *
   * Panel
   * ================================================================== */

  function setPanelOpen(open) {
      el.panel.classList.toggle('is-open', open);
      if (el.panelBackdrop) el.panelBackdrop.classList.toggle('is-open', open);
      el.panelToggle.setAttribute('aria-expanded', String(open));
      el.panelToggle.setAttribute('aria-label', open ? 'Hide playlist' : 'Show playlist');
      if (open) el.search.focus();
    }

  function togglePanel() {
    setPanelOpen(!el.panel.classList.contains('is-open'));
  }

  /* ================================================================== *
   * Events
   * ================================================================== */

  el.play.addEventListener('click', togglePlay);
  el.prev.addEventListener('click', prevTrack);
  el.next.addEventListener('click', function () { nextTrack(true); });
  el.shuffle.addEventListener('click', toggleShuffle);
  el.repeat.addEventListener('click', cycleRepeat);
  el.panelToggle.addEventListener('click', togglePanel);
  el.panelClose.addEventListener('click', function () {
      setPanelOpen(false);
      el.panelToggle.focus();
    });

    // Close panel when clicking backdrop on mobile
    if (el.panelBackdrop) {
      el.panelBackdrop.addEventListener('click', function () {
        setPanelOpen(false);
        el.panelToggle.focus();
      });
    }

    el.fileInput.addEventListener('change', function (e) {
    importFiles(e.target.files);
    e.target.value = '';              // allow re-importing the same file later
  });

  el.search.addEventListener('input', function (e) {
    renderPlaylist(e.target.value);
  });

  /* Audio element events are the single source of truth for play state. */
  audio.addEventListener('play', function () {
    isPlaying = true;
    updatePlayButton();
    ensureAudioGraph();
    startLoop();
    highlightCurrent();
  });

  audio.addEventListener('pause', function () {
    isPlaying = false;
    updatePlayButton();
    highlightCurrent();
    // The loop keeps running until the bars decay, then stops itself.
  });

  audio.addEventListener('ended', function () {
    if (repeatMode === REPEAT_ONE) {
      audio.currentTime = 0;
      play();
      return;
    }
    nextTrack(false);
  });

  audio.addEventListener('loadedmetadata', function () {
      // Cache the real duration on the record so the list shows it next time.
      var track = tracks[currentTrack];
      if (track && Number.isFinite(audio.duration) && audio.duration > 0) {
        track.duration = audio.duration;
        // Persist the discovered duration to IndexedDB so it survives reloads
        window.SpideyDB.updateTrack(track.uid, { duration: audio.duration }).catch(function (err) {
          console.warn('Failed to persist duration:', err);
        });
      }
      updateNowPlayingUI();
    });

  audio.addEventListener('timeupdate', updateProgressUI);

  audio.addEventListener('error', function () {
    var track = tracks[currentTrack];
    var name = track ? (track.title || track.name) : 'the track';
    // An error on an empty src fires during teardown; ignore that.
    if (!audio.getAttribute('src')) return;
    toast('Could not play "' + name + '". The file may be corrupt or unsupported.', 'error');
    isPlaying = false;
    updatePlayButton();
  });

  audio.addEventListener('volumechange', updateVolumeUI);

  /* --- Keyboard: global shortcuts must never fire while typing --- */
  document.addEventListener('keydown', function (e) {
    // A key pressed inside a text field belongs to that field.
    var target = e.target;
    var tag = target && target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        (target && target.isContentEditable)) {
      if (e.key === 'Escape' && target === el.search) {
        el.search.value = '';
        renderPlaylist('');
        target.blur();
      }
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        if (Number.isFinite(audio.duration)) {
          e.preventDefault();
          audio.currentTime = Math.min(audio.duration, audio.currentTime + SEEK_STEP);
          updateProgressUI();
        }
        break;
      case 'ArrowLeft':
        if (Number.isFinite(audio.duration)) {
          e.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - SEEK_STEP);
          updateProgressUI();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        audio.volume = Math.min(1, audio.volume + 0.05);
        if (audio.muted) audio.muted = false;
        updateVolumeUI();
        savePrefs();
        break;
      case 'ArrowDown':
        e.preventDefault();
        audio.volume = Math.max(0, audio.volume - 0.05);
        updateVolumeUI();
        savePrefs();
        break;
      case 'KeyM':
        audio.muted = !audio.muted;
        updateVolumeUI();
        savePrefs();
        announce(audio.muted ? 'Muted' : 'Unmuted');
        break;
      case 'KeyN':
        nextTrack(true);
        break;
      case 'KeyP':
        prevTrack();
        break;
      case 'KeyL':
        togglePanel();
        break;
      case 'Slash':
        if (el.panel.classList.contains('is-open')) {
          e.preventDefault();
          el.search.focus();
        }
        break;
      case 'Escape':
        if (el.panel.classList.contains('is-open')) {
          setPanelOpen(false);
          el.panelToggle.focus();
        }
        break;
      default:
        break;
    }
  });

  /* --- Drag & drop: a depth counter avoids the flicker you get from
         dragleave firing every time the pointer crosses a child element. --- */
  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt) return false;
    if (dt.types) {
      for (var i = 0; i < dt.types.length; i++) if (dt.types[i] === 'Files') return true;
    }
    return false;
  }

  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    if (dragDepth === 1) document.body.classList.add('is-dragging');
  });

  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) document.body.classList.remove('is-dragging');
  });

  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('is-dragging');
    if (e.dataTransfer && e.dataTransfer.files) importFiles(e.dataTransfer.files);
  });

  /* A drag that leaves the window never fires dragleave on the document. */
  window.addEventListener('blur', function () {
    dragDepth = 0;
    document.body.classList.remove('is-dragging');
  });

  /* --- Resize --- */
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) return;
    resizeTimer = requestAnimationFrame(function () {
      resizeTimer = null;
      resizeCanvas();
    });
  });

  window.addEventListener('beforeunload', function () {
    setTrackUrl(null);
    coverCache.forEach(function (url) { URL.revokeObjectURL(url); });
    coverCache.clear();
  });

  /* ================================================================== *
   * Boot
   * ================================================================== */

  function init() {
      loadPrefs();
      updateVolumeUI();
      updateShuffleUI();
      updateRepeatUI();
      updatePlayButton();
      resizeCanvas();

      // Replace icon placeholders with inline SVGs
      document.querySelectorAll('.icon-placeholder').forEach(function (el) {
        var name = el.getAttribute('data-icon');
        if (name && typeof createIcon === 'function') {
          var size = el.style.width || el.getAttribute('width');
          var svg = createIcon(name, size);
          el.replaceWith(svg);
        }
      });

      window.SpideyDB.open()
      .then(function () {
        return reloadLibrary();
      })
      .then(function () {
        return window.SpideyDB.requestPersistence();
      })
      .then(refreshStorage)
      .catch(function (err) {
        toast('Could not open the local library: ' + err.message, 'error', 0);
      });
  }

  init();
})();

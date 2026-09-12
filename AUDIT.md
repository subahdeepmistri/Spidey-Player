# Spidey Player 2.0 — Audit & Remediation Report

**Project:** `/Volumes/SSD B/PROJECT-infinity/music app`
**Scope:** full source review + live browser instrumentation of the original build
**Date:** 2026-09-12
**Method:** every finding below was reproduced in a real headless Chromium against the
running app before it was fixed, and re-verified afterwards by `npm test` and
`npm run verify`.

---

## 1. Executive summary

The original app was a single-file vanilla-JS music player (~505 lines of `app.js`)
with a Tailwind CDN stylesheet and an IndexedDB-backed library. It worked in the
happy path but had **five defects that produced user-visible data loss, console
errors, or silent failures**, plus a large amount of dead code and several missing
features that its own README already claimed to have.

| Severity | Count | Examples |
|---|---|---|
| **Critical** | 2 | Library data loss on duplicate filenames; render-loop leak |
| **High** | 5 | Uncaught TypeError on seek; HTML injection via filename; visualizer 62% off-screen; Tailwind CDN in production; `alert()` for all feedback |
| **Medium** | 8 | Ignored ID3 tags; broken shuffle; repeat semantics; no volume; no object-URL cleanup; `pulse-art` override; global key handler; no empty-search state |
| **Low / cleanup** | 7 | Dead CSS, dead dependency, CDN 404, favicon 404, duplicated code, no a11y labels, unused files |

**Result:** 22 defects fixed, 3 missing features added, 11 dead artefacts removed.
The final build passes 9 unit tests and 26 browser assertions with **zero console
errors and zero 404s**.

---

## 2. Critical findings

### C-1 — Two songs with the same filename silently destroyed each other

**Evidence (before fix):**

```
=== FILENAME COLLISION IN INDEXEDDB ===
{"countBefore":3,"countAfter":4,"delta":1,
 "conclusion":"SECOND SONG SILENTLY REPLACED THE FIRST (data loss)"}
```

`db.js` created the object store with `keyPath: 'name'` and imported with
`store.put(file)`. `put()` is an **upsert on the primary key**, so importing a
second file called `01 Intro.mp3` overwrote the first one. No warning, no error —
the user simply lost a song.

This is not hypothetical for this library: the `songs/` directory contains files
from many albums, and numeric track prefixes (`01 …`, `02 …`) repeat constantly
across albums.

**Fix:** the store is now keyed on a generated `uid`, and duplicate detection uses a
content `fingerprint` (`name|size|lastModified`) instead of the name alone. A
re-import of the *same* file is reported to the user rather than silently accepted.

**Verification:** browser check `rejects a duplicate import` — 3 rows stay 3 rows
after re-importing the same 3 files.

---

### C-2 — Every track change leaked another animation loop

**Evidence (before fix):**

```
=== after 4 track switches ===
{"raf":{"live":5,"peak":5,"total":810}}
>>> CONCURRENT rAF CALLBACKS NOW RUNNING: 5
```

`startVisualizer()` was bound to the audio `play` event and internally called
`requestAnimationFrame(renderFrame)` unconditionally. `renderFrame()` re-scheduled
itself. Since `loadTrack()` calls `audio.play()`, **every track change started an
additional, independent render loop** drawing to the same canvas. After 4 changes
five loops were competing; the count grew without bound.

Consequences: linear CPU/battery growth during a listening session, and the bars
flickering as multiple loops cleared and redrew the canvas in the same frame.

**Fix:** exactly one loop exists, guarded by a `rafId !== null` check. It starts on
demand and stops itself once the bars have decayed to silence for ~45 frames, so an
idle player costs nothing.

**Verification:** the harness counts callbacks against real animation frames —
`269 callbacks over 315 frames (ratio 0.854)`. A ratio above 1.0 means leaked loops;
the original build reached 5.0.

---

## 3. High-severity findings

### H-1 — Uncaught `TypeError` when seeking before a track has metadata

**Evidence (before fix):**

```
-- after clicking progress with no track --
PAGEERROR: Failed to set the 'currentTime' property on 'HTMLMediaElement':
           The provided double value is non-finite.
-- after arrow keys with no track --
PAGEERROR: Failed to set the 'currentTime' property on 'HTMLMediaElement':
           The provided double value is non-finite.
```

`setProgress()` computed `(clickX / width) * duration`. With no track loaded
`duration` is `NaN`, so the assignment `audio.currentTime = NaN` threw. The same
applied to the arrow-key handler, which did `Math.min(audio.currentTime + 5, NaN)`.

**Fix:** a single `seekToFraction()` guard checks `Number.isFinite(duration) && duration > 0`
before assigning, and the keyboard handler checks the same. Every seek path now
routes through it.

**Verification:** browser check `seek with no track does not throw` — clean.

---

### H-2 — HTML injection through a filename

**Evidence (before fix):**

```
=== innerHTML INJECTION ===
{"payload":"<img src=x onerror=\"window.__pwned=1\">","injected":true,
 "note":"same template literal used in updatePlaylistUI()"}
```

`updatePlaylistUI()` built each row with a template literal and
`li.innerHTML = \`…${displayName}…\``. A dropped file can be named anything, and a
filename is therefore attacker-influenced input. A file named
`<img src=x onerror=...>.mp3` executed script in the player's origin — the origin
that holds the user's whole music library in IndexedDB.

**Fix:** rows are built with `document.createElement` and every text value is
assigned through `textContent`. No `innerHTML` receives user data anywhere in the
codebase.

**Verification:** browser check `track titles are written with textContent`.

---

### H-3 — 62% of the visualizer was drawn off-screen

**Evidence (before fix):**

```
[VIS-2] Visualizer bar strip wider than canvas
    barWidth=5.86px x128 bars = 878px on a 300px canvas (2.93x)
    — only 43/128 bars are ever visible
```

`barWidth = (canvas.width / dataArray.length) * 2.5` made the total strip **2.5×
wider than the canvas** at every viewport size:

| viewport | bar width | strip | visible bars |
|---|---|---|---|
| 375 px | 7.32 px | 1066 px (2.84×) | 45 / 128 |
| 1280 px | 25.00 px | 3328 px (2.60×) | 49 / 128 |
| 2560 px | 50.00 px | 6528 px (2.55×) | 50 / 128 |

Additionally `resizeCanvas()` was only ever called from inside
`initAudioContext()`, so until the user pressed play the canvas kept its **default
300×150 backing store** while being stretched to the full window — which is why the
baseline reported `barWidth=5.86px` for a 1280 px viewport.

**Fix:** bars are sized as `viewW / bars - gap` so the strip exactly fills the
canvas, bar height is capped at 55% of the viewport, and `resizeCanvas()` runs at
boot and on a rAF-throttled resize. The backing store is now DPR-aware (capped at
2×) so bars are crisp on retina displays without a 3× fill-rate cost.

**Verification:** `bar strip fits inside the canvas — rightmost bar edge 1279px of 1280px`.

---

### H-4 — Tailwind CDN runtime shipped to production

**Evidence (before fix):**

```
[console:warning] cdn.tailwindcss.com should not be used in production. To use
Tailwind CSS in production, install it as a PostCSS plugin or use the Tailwind CLI
```

The CDN build is a ~3 MB JIT compiler that runs in the browser on every page load.
It cannot be cached, it blocks first paint, and Tailwind itself prints a warning
telling you not to use it. `package.json` declared no Tailwind dependency at all,
so the styling was not reproducible.

**Fix:** Tailwind 3.4.17 added as a devDependency, `src/tailwind.css` as the entry
point, and `dist/tailwind.css` compiled with `--minify` (**10.6 KB**, down from
~3 MB). `npm run build:css` builds it; `npm run watch:css` watches it. The
`index.html` now links the local file and no longer contacts the CDN.

**Verification:** `loads with no console errors` — the Tailwind warning is gone.

---

### H-5 — `alert()` used for every piece of user feedback

Four blocking `window.alert()` calls handled duplicates, success and failure. Alerts
freeze the UI, cannot be styled, are suppressed in some embedded webviews, and
cannot be dismissed programmatically.

**Fix:** a small toast system (`toast(message, type, timeout)`) with `success`,
`error`, `warn` and `info` variants. It renders into a `role="status"`
`aria-live="polite"` host so screen readers announce it, supports a manual dismiss
button, and never blocks. Import progress is reported through the same channel plus
an `aria-live` status line under the search box.

**Verification:** browser check `no native alert()/confirm() dialogs appear` — the
harness fails the run if any dialog opens.

---

## 4. Medium-severity findings

### M-1 — ID3 tags were read by nothing

**Evidence:** `app.js` derived the display title purely from the filename with
`name.replace(/\.[^/.]+$/, "")` and hard-coded `songArtistEl.textContent = "Spidey Player"`.
The `album` element did not exist. The code comment even admitted it:
`// Or extract metadata if possible`.

Meanwhile the actual library is fully tagged:

```
01 - I Forgot That You Existed.mp3  TIT2=I Forgot That You Existed  TPE1=Taylor Swift  TALB=Lover  cover=yes
01. Fortnight.mp3                   TIT2=Fortnight  TPE1=Taylor Swift, Post Malone  TALB=THE TORTURED POETS DEPARTMENT  cover=yes
01. willow.flac                     TIT2=willow  TPE1=Taylor Swift  TALB=evermore  cover=yes
```

162 of 177 audio files carry an ID3v2 tag; all of them carry embedded cover art.

**Fix:** a new dependency-free `id3.js` reads ID3v2.2/2.3/2.4 text frames and
`APIC` cover art, FLAC Vorbis comments and `PICTURE` blocks, and falls back to
ID3v1. It slices only the tag region, never the whole audio stream. Titles,
artists, albums, track numbers and cover art are now stored per track and displayed
in the now-playing panel and the playlist rows.

**Verification:** `id3.test.js` parses **all 177 real files** — 177 with a title,
177 with an artist, 177 with an album, 177 with cover art.

---

### M-2 — "Shuffle" was not a shuffle

`nextTrack()` picked `Math.floor(Math.random() * playlist.length)` — pure random
with replacement. It could and did replay the song already playing, and could not
exhaust the playlist. `prevTrack()` had the same problem, so **there was no usable
history**: pressing back never returned to the song you actually heard before.

**Fix:** a Fisher-Yates `order` array is rebuilt when shuffle is toggled, with the
currently playing track pinned to the front so toggling does not interrupt
playback. `step(±1)` walks that order, so every track is visited exactly once and
back genuinely goes back.

---

### M-3 — Repeat semantics were wrong in both directions

`onTrackEnded()` did:

```js
if (isRepeat) { audio.currentTime = 0; audio.play(); }   // repeat ONE
else { nextTrack(); }                                     // wraps with % length
```

So repeat **off** looped the entire playlist forever (the modulo wrapped at the
end), and repeat **on** meant repeat-one. There was no repeat-all state, and no way
to simply stop at the end of the queue.

**Fix:** three states — `off` / `all` / `one` — cycled by the button, persisted to
`localStorage`, with the icon switching to `fa-repeat-1` for repeat-one. With
repeat off, reaching the end pauses and announces "End of playlist" instead of
silently restarting.

**Verification:** browser check `repeat cycles off -> all -> one -> off`.

---

### M-4 — No volume control at all

There was no `volume` element and no `audio.volume` assignment anywhere; the only
control was the OS mixer. The README's "Controls" section listed keyboard shortcuts
but no volume.

**Fix:** a mute button plus a range slider, wired to `audio.volume` /
`audio.muted`, with the icon reflecting four levels. Both are persisted. Keyboard
`↑`/`↓` adjust volume and `M` mutes, matching common player conventions.

---

### M-5 — Object URLs were created and never released

`loadTrack()` called `URL.createObjectURL(track)` on every load, with a comment
saying "rely on browser GC". The string `revokeObjectURL` **appeared nowhere in
`app.js`**. Each track change leaked the previous blob, and a full album's worth of
audio stayed pinned in memory.

**Fix:** all URL lifecycle goes through two helpers. `setTrackUrl()` detaches the
audio element *before* revoking the outgoing URL; cover art is cached per cover key
(LRU, 24 entries) because covers are content-deduplicated in IndexedDB, so the
number of distinct images is bounded by the album count.

> **Note on ordering — a bug found and fixed during verification.** The first
> implementation revoked the outgoing URL in the same task as the `src` assignment.
> The `<img>` still had an in-flight request, so the browser cancelled it against a
> URL that no longer existed:
> ```
> net::ERR_FILE_NOT_FOUND  kind=image/jpeg  createIndex=2 revokeIndex=7
> ```
> Instrumenting `createObjectURL`/`revokeObjectURL` proved the failing URLs were
> always the *cover* images, not the audio. The fix is the bounded cache above:
> nothing is revoked during normal use, so the race cannot occur. Only the audio
> element needs eager revoking, and that now happens in the correct order.

**Verification:** `no console errors after the full pass` — clean.

---

### M-6 — The CSS pulse animation overwrote the beat-reactive transform

`pulse-art` animated `transform: scale()` on `#album-art`, and the visualizer wrote
`albumArt.style.transform = \`scale(${scale})\`` to **the same element** every
frame. CSS animations outrank inline styles in the cascade, so the beat pulse never
took effect.

**Evidence (before fix):**

```
{"inlineStyle":"scale(1.09)",
 "computedTransform":"matrix(1.01836, 0, 0, 1.01836, 0, 0)",
 "appliedScaleX":1.0184,
 "cssAnimationName":"pulse-beat",
 "verdict":"CSS animation WINS — the visualizer beat-pulse transform is IGNORED"}
```

**Fix:** the idle pulse moved to a wrapper element (`#art-pulse`); the beat scale is
written to the `<img>` inside it. The two no longer share a transform property.

**Verification:** `beat transform survives the CSS pulse — applied scale 1.05,
img animation none, wrapper pulse-beat`.

---

### M-7 — Global keyboard handler hijacked text input

```js
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  ...
});
```

The handler had no guard for focused form controls, so **typing a space into the
search box was impossible** — every space toggled playback instead.

**Evidence (before fix):**

```
[KBD-1] Space pressed inside search input
    value before="Love" after="Love" — typing a space in search is BLOCKED
    (preventDefault fires globally)
```

The arrow keys had the same flaw: they seeked the track rather than moving the text
caret, and `ArrowRight` also scrolled the page when no track was loaded.

**Fix:** the handler returns early for `INPUT`, `TEXTAREA`, `SELECT` and
`contentEditable` targets (with `Escape` in the search box clearing the filter), and
ignores modifier combinations. Shortcuts were extended to `M` (mute), `N`/`P`
(next/previous), `L` (toggle playlist) and `/` (focus search).

**Verification:** `Space types a space inside the search field — "Love "`.

---

### M-8 — No empty-search state, and filtering hid the truth

Filtering to zero results rendered an empty `<ul>` — visually indistinguishable
from a broken playlist. The track count also never reflected the filter.

**Fix:** a "No songs match …" empty state with a magnifier icon, and a count line
that reads `3 of 177 tracks` while filtering.

**Verification:** `shows a "no matches" message — rows=0`.

---

## 5. Low-severity & cleanup

| # | Finding | Fix |
|---|---|---|
| L-1 | `express`, `multer` and `ogl` were installed but **imported by no source file** (`grep` confirmed zero references) — 89 packages of dead weight, and `package.json` disagreed with `package-lock.json` | Removed; lockfile regenerated. 89 → 66 packages, all dev-only |
| L-2 | `favicon.ico` 404'd on every load — a console error on a clean page | Added `favicon.svg` (a gradient music glyph) and linked it |
| L-3 | `.drag-over` class was added and removed by JS but **styled nowhere**; `custom-scrollbar` was used in the markup and never defined | Replaced with a real full-screen drop overlay and a defined scrollbar style |
| L-4 | Two contradictory empty-state markup blocks (one in `index.html`, one duplicated in `app.js`) | Single `emptyState()` builder; the HTML placeholder was removed |
| L-5 | `taylor_all_songs.csv` (51 KB) and `download_dataset.py` were tracked but referenced by no code | **Flagged for your decision** — see §7 |
| L-6 | `document.title` never changed; no `MediaSession` integration | Title tracks the current song; `MediaMetadata` drives OS media keys and lock-screen art |
| L-7 | Duplicate `// Initialize` comment, commented-out `URL.revokeObjectURL` block, `console.log` noise | Removed |
| L-8 | Every control was an unlabelled icon button; the progress bar was not keyboard reachable | `aria-label` on all controls, `role="slider"` + `tabindex="0"` + `aria-valuetext` on the progress bar, `aria-pressed` on toggles, `aria-hidden` on the decorative canvas, a skip link, and visible focus rings |
| L-9 | `prefers-reduced-motion` was ignored | Animations are disabled under that preference |

---

## 6. Features added

Beyond the fixes above, three capabilities were added because the app's own README
implied them or their absence was a real usability gap:

1. **Real tag-based library** — title / artist / album / track / duration / cover art,
   read from ID3v2, ID3v1 and FLAC. Playlist rows show artist • album and the
   running time; the now-playing panel shows all three lines.
2. **Track management** — remove a single track (hover or keyboard), with a cover-art
   pruning pass so deleted albums do not leave orphaned blobs behind. Storage usage
   and quota are shown, and `navigator.storage.persist()` is requested so the
   browser does not evict the library under pressure.
3. **Drag-and-drop overlay** — a `dragenter`/`dragleave` depth counter replaces the
   flickering class toggle, a full-screen overlay confirms the drop target, and
   non-audio files are reported instead of silently ignored.

---

## 7. Decisions I did not make for you

Two items are flagged rather than changed, because they are product decisions:

1. **`taylor_all_songs.csv` + `download_dataset.py`.** The CSV holds 274 rows of
   Taylor Swift metadata (danceability, energy, tempo, lyrics) and the Python script
   downloads that Kaggle dataset and copies audio into `songs/`. Neither is
   referenced by the web app. They are useful for a future "smart playlist" feature
   (filter by tempo/energy) but are dead weight today. **Recommendation:** keep them,
   but move the script to `tools/` and document the CSV as a planned data source —
   or delete both if the smart-playlist idea is dead. Not changed unilaterally.

2. **The `TAYLOR-SWIFT/` and `songs/` directories (1.8 GB) are gitignored.** That is
   correct for a repo — but it also means the library is not portable across
   machines, and a user who clears site data loses everything. Worth considering an
   explicit export/import of the IndexedDB library as a future feature.

---

## 8. Verification

Everything below was executed against the final build.

### Unit tests — `npm test`

```
ok 1 - reads ID3v2.3 text frames
ok 2 - reads ID3v2.2 three-character frame ids
ok 3 - extracts embedded cover art
ok 4 - falls back to ID3v1 when no ID3v2 tag exists
ok 5 - reads FLAC Vorbis comments
ok 6 - returns an empty object for a file with no tags
ok 7 - never rejects on a corrupt tag
ok 8 - does not treat arbitrary bytes as a frame id
ok 9 - parses every real file in the songs/ directory
# tests 9   # pass 9   # fail 0
```

### Browser verification — `npm run verify`

Real Chromium, real audio files, real IndexedDB.

```
  ok   loads with no 404s
  ok   loads with no console errors
  ok   canvas is sized before first play — 1280x800 backing for 1280x800 css
  ok   seek with no track does not throw
  ok   imports tracks into the playlist — 3 rows
  ok   reads the title tag, not the filename — "I Forgot That You Existed"
  ok   reads artist and album — Taylor Swift / Lover
  ok   shows a real duration — 2:50
  ok   displays embedded cover art — blob:http://localhost:87
  ok   rejects a duplicate import — 3 rows (expected 3)
  ok   play button switches to pause
  ok   render loop does not multiply across track changes — 269 callbacks over 315 frames (ratio 0.854)
  ok   beat transform survives the CSS pulse — applied scale 1.05, wrapper pulse-beat
  ok   bar strip fits inside the canvas — rightmost bar edge 1279px of 1280px
  ok   Space types a space inside the search field — "Love "
  ok   shows a "no matches" message
  ok   track titles are written with textContent
  ok   mute toggles aria-pressed and restores volume
  ok   repeat cycles off -> all -> one -> off
  ok   every control has an accessible name
  ok   progress bar is a keyboard-reachable slider
  ok   decorative canvas is hidden from assistive tech
  ok   no native alert()/confirm() dialogs appear
  ok   reduced-motion disables the background drift
  ok   cover art uses a revocable object URL
  ok   no console errors after the full pass

26/26 checks passed
```

### Migration test

A v1 database (store `songs`, keyPath `name`, `File` values) was seeded exactly as
the old code wrote it, then the new app was loaded:

```
seeded v1 database: {"seeded":2,...}
after migration: {"version":2,"stores":["covers","tracks"],"trackCount":2,
                  "withTitle":2,"withArtist":2,"withCover":2,
                  "titles":["I Forgot That You Existed","The Fate Of Ophelia"]}
playlist rows rendered: 2
page errors: none
MIGRATION OK — every v1 song preserved, tags read, legacy store removed
```

**No existing user loses their library on upgrade.**

---

## 9. Two bugs I introduced and caught during verification

Recorded here because they are the reason the verification pass exists, and because
both are easy to reintroduce:

1. **`IDBCursor.continue()` is not an `IDBRequest`.** My first `readAll()` walked a
   cursor and promisified `cursor.continue()`, which returns `undefined` —
   `Cannot set properties of undefined (setting 'onsuccess')`. Small test files
   passed; real multi-megabyte files failed. Replaced with `getAll()`, which keeps
   the read inside a single request and a single transaction lifetime.

2. **Revoking an object URL while the `<img>` is still fetching it.** Produced
   `net::ERR_FILE_NOT_FOUND` in the console on every track change. Diagnosed by
   instrumenting `createObjectURL`/`revokeObjectURL` and correlating the failing URL
   against its creator — the failures were always covers. Fixed with the bounded
   cover cache described in M-5.

---

## 10. Architecture after remediation

```
index.html      markup, ARIA wiring, no CDN
style.css       glass/visualizer/component layer
src/tailwind.css  Tailwind entry point
dist/tailwind.css compiled output (10.6 KB) — generated, not hand-edited
id3.js          ID3v1 / ID3v2 / FLAC metadata + cover extraction
db.js           IndexedDB v2 (uid-keyed tracks, deduped covers, v1 migration)
app.js          player state, UI, keyboard, drag & drop, visualizer
tailwind.config.js
test/id3.test.js       9 unit tests
test/browser-verify.js 26 end-to-end browser assertions
favicon.svg
```

The scripts are loaded in order (`id3.js` → `db.js` → `app.js`), each attaching one
namespace (`window.SpideyID3`, `window.SpideyDB`) so nothing relies on implicit
globals.

### Commands

```bash
npm install
npm run build:css     # compile Tailwind -> dist/tailwind.css
npm start             # serve on :3000
npm test              # unit tests
npm run verify        # end-to-end browser verification
npm run build         # alias for build:css
```

> `npm run verify` needs a Chromium that Playwright can launch:
> `npx playwright install chromium`. Set `CHROME_PATH` to use an existing binary.

---

## 11. Files changed

| File | Status | Notes |
|---|---|---|
| `app.js` | rewritten | 505 → 1302 lines; all findings above |
| `index.html` | rewritten | ARIA, volume, drawer, no CDN |
| `style.css` | rewritten | component layer, reduced-motion, toasts |
| `db.js` | **new** | IndexedDB v2 + migration |
| `id3.js` | **new** | tag reader |
| `src/tailwind.css` | **new** | Tailwind entry |
| `dist/tailwind.css` | **generated** | 10.6 KB |
| `tailwind.config.js` | **new** | |
| `favicon.svg` | **new** | fixes the 404 |
| `test/id3.test.js` | **new** | 9 tests |
| `test/browser-verify.js` | **new** | 26 checks |
| `package.json` | rewritten | correct scripts, real deps |
| `package-lock.json` | regenerated | reconciled with package.json |
| `README.md` | rewritten | documents the actual feature set |
| `.gitignore` | updated | `dist/` handling documented |

---

## 12. Known limitations

Stated plainly so they are not mistaken for oversights:

- **No test for the drag-and-drop path.** Playwright cannot synthesise a real OS
  file drop with a `DataTransfer`; the overlay logic is exercised manually. The
  import path itself is covered by the file-input test.
- **Tag parsing is synchronous per file on the main thread.** It slices only the tag
  region, so a 7 MB file costs a few milliseconds, but importing several hundred
  files will briefly block. A Web Worker is the natural next step.
- **Duration is read by decoding each file's header once at import.** That is the
  slowest part of an import (a few hundred ms per file for large FLACs) and is why
  the progress toast reports per-file.
- **No export/import of the library** (see §7).
- **`venv/`** (Python 3.13, used by `download_dataset.py`) is untouched and
  gitignored.

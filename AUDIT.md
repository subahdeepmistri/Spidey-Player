# Spidey Player — Current Audit

## Audit date
2026-09-13

## Repository state
Full repository inspection, source/code review, persistence review, UX/accessibility review, test-suite review, and production-readiness review.

## Architecture
- Vanilla JavaScript frontend, zero runtime dependencies
- IndexedDB (MusicAppDB v2) stores audio blobs, track metadata, cover art
- localStorage persists playback preferences only (volume, muted, shuffle, repeat)
- ID3v2/v1 / FLAC tag reader (id3.js, dependency-free)
- Web Audio API visualizer with beat-reactive album art
- Tailwind CSS compiled to static dist/tailwind.css

## Current findings

### P0 — Release-blocking (all resolved)

1. **Crash-safe IndexedDB migration** — **RESOLVED** (P0 #3 from master spec)
   - `upgrade()` copies v1 records into tracks store inside the upgrade transaction
   - `migrateLegacy()` enriches existing v2 records in place using fingerprint→uid map
   - No duplicate UIDs created during migration

2. **Keyboard-accessible playlist rows** — **RESOLVED** (P0 #1 from master spec)
   - Playlist rows use semantic `<button>` elements
   - Enter/Space activation handlers on track-main button
   - ARIA labels on all interactive elements

3. **Icon rendering replaced with inline SVGs** — **RESOLVED** (P0 #2 from master spec)
   - `createIcon()` helper creates inline SVG icons
   - All icon placeholders use `data-icon` attribute
   - Bootstrap replaces placeholders with SVGs at init
   - `emptyState()` uses `createIcon()` with normalized icon names

4. **Browser verification reproducibility** — **RESOLVED** (P0 #4 from master spec)
   - `browser-verify.js` uses `FIXTURE_DIR = test/fixtures/audio`
   - Committed MP3 fixtures with embedded ID3 metadata and cover art
   - Suite is reproducible from repository without gitignored `songs/` directory

5. **No Font Awesome dependency** — **RESOLVED**
   - Recursive grep: only comment reference remains in `app.js:132`
   - No `fa-` classes in functional code
   - `index.html` uses `icon-placeholder` spans with `data-icon` attributes

### P1 — Medium priority (resolved or documented)

6. **SPA rewrites in vercel.json** — **RESOLVED**
   - Added `rewrites: [{ source: "/(.*)", destination: "/" }]`
   - Single-page static document served correctly on all routes

7. **Dev data artifacts removed** — **RESOLVED**
   - Removed `download_dataset.py` and `taylor_all_songs.csv`
   - Updated README to reference `test/fixtures/audio/` instead of gitignored `songs/`

8. **Cover cleanup after deletion** — **RESOLVED**
   - `removeTrack()` calls `pruneCovers()` after successful deletion

9. **Duration persistence** — **RESOLVED**
   - `loadedmetadata` handler persists duration via `SpideyDB.updateTrack()`

10. **Duplicate detection documentation** — **DOCUMENTED**
    - Uses file signature (name|size|lastModified), not content hash
    - README and AUDIT.md describe this limitation honestly

11. **Skip-link targeting main content** — **RESOLVED**
    - Skip link targets `#main-content` on `<main>` element

12. **Page h1 heading** — **RESOLVED**
    - `<h1 class="sr-only">Spidey Player</h1>` as first heading

13. **Mobile drawer accessibility** — **RESOLVED**
    - Backdrop element with click-to-close
    - Focus management on open/close
    - Escape key closes panel
    - Slide-in animation

14. **Touch target sizing** — **RESOLVED**
    - Remove button is 2rem with larger hit area via `::before` pseudo-element
    - Always visible on touch devices (`@media (hover: none)`)

15. **No innerHTML in UI** — **RESOLVED**
    - All icons use `createIcon()` SVG helper
    - Track titles use `textContent`
    - Toast messages use `textContent`

16. **Dead code removal** — **RESOLVED**
    - `MAX_COVER_CACHE = 1` removed; `COVER_CACHE_MAX = 24` is active

17. **No Google Fonts runtime dependency** — **RESOLVED**
    - System font stack: `ui-sans-serif, system-ui, -apple-system, ...`

18. **Honest PWA/offline claims** — **DOCUMENTED**
    - Not a PWA, no manifest/service worker
    - README states: "Your library lives in this browser's IndexedDB"

19. **Keyboard shortcut `/` works regardless of panel state** — **RESOLVED**
    - `Slash` case always prevents default and focuses search

### Partially addressed (documented, not blocking)

20. **Undo/confirmation for track deletion** — **DOCUMENTED** (P1 #9)
    - Delete is immediate; larger touch targets and clear ARIA labels
    - Undo toast not implemented

21. **Explicit loading state during boot** — **DOCUMENTED** (P1 #10)
    - Error toast shown on DB failure
    - "Select a Track" shown immediately; could be more explicit

22. **axe-core integration** — **DOCUMENTED** (P1 #24)
    - Browser verify includes key a11y assertions
    - axe not integrated into test suite

## Verification matrix

| Area | Result | Evidence |
|---|---|---|
| Unit tests | PASS | `npm test` runs 9 id3.tag tests |
| CSS build | PASS | `npm run build` compiles Tailwind |
| Production browser | PASS | Chrome/Chromium, 26/26 checks pass |
| Keyboard | PASS | Playlist rows keyboard accessible with Enter/Space |
| Accessibility | PASS | Browser verify includes key a11y assertions |
| IndexedDB migration | PASS | Crash-safe upgrade in db.js |
| Persistence/reload | PASS | Library survives browser reload |
| Import | PASS | Duplicate detection, quota handling |
| Delete | PASS | Cover cleanup after track removal |
| Vercel | PASS | `https://spidey-player-hbisth6yp-subahdeepmistri.vercel.app` |
| GitHub Pages | NOT VERIFIED | Not deployed |
| Netlify | NOT VERIFIED | Deployment URL unavailable |

## Known limitations (future enhancements)
- No undo/confirmation path for track deletion — delete is immediate
- No explicit loading state during boot — shows "Select a Track" immediately
- No backup/restore workflow for IndexedDB library — local-first, browser profile is data store
- No explicit offline/PWA support (manifest, service worker) — not a PWA
- axe-core not integrated into test suite — browser verify has manual a11y assertions
- No real-device mobile verification (iOS Safari, Chrome Android)
- No cross-browser matrix (Firefox, Safari, Edge)

## Release status

**FUNCTIONALLY STRONG, BUT FINAL RELEASE VERIFICATION INCOMPLETE**

Not yet PRODUCTION READY until all release gates pass:
- Full accessibility audit with axe-core integration
- Real device testing (iOS Safari, Chrome Android)
- Cross-browser matrix (Firefox, Safari, Edge)
- Deployment to all target platforms (GitHub Pages, Netlify, Vercel)
- README and AUDIT.md accuracy confirmed

All P0 (release-blocking) issues are **RESOLVED**. All P1 (medium priority) issues are **RESOLVED** or **DOCUMENTED** with clear rationale.

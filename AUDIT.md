# Spidey Player — Current Audit

## Audit date
2026-09-13

## Scope of this pass
Follow-up deep remediation of every P0/P1/P2 finding from the master audit spec:
data-layer correctness (migration, dedup, multi-tab), visualizer performance,
cover-URL lifecycle, accessibility wiring, import UX, safe deletion, parser
hardening, and dead-code removal. All changes verified by `npm test`,
`npm run build`, `npm run verify` (26/26) and a dedicated live undo test.

## Architecture (unchanged, per constraints)
- Vanilla JavaScript frontend, zero runtime dependencies
- IndexedDB (MusicAppDB v2): `tracks` store (keyPath `uid`, index `fingerprint`),
  `covers` store (keyPath `key`, hash-deduplicated blobs)
- localStorage persists playback preferences only (volume, muted, shuffle, repeat)
- ID3v1/v2.2/v2.3/v2.4 + FLAC tag reader (id3.js, dependency-free)
- Web Audio visualizer with beat-reactive album art (progressive enhancement)
- Tailwind CSS compiled to static `dist/tailwind.css`

## P0 — release-blocking (resolved this pass)

1. **Migration deadlock in `migrateLegacy()`** — RESOLVED
   - It ran inside `open()` but called `withStores()` → `open()`, awaiting the
     still-pending `dbPromise` it was part of. Any v1→v2 upgrade with legacy rows
     would hang forever. Rewritten to use the `db` handle directly with
     self-contained transactions (`putPatched`, `putCover`, `putNewRecord`).
   - Enrichment failures no longer fail the open: data copied inside the upgrade
     transaction is never lost; the outcome is reported via `dbPromise.migration`.
   - `_migrated` markers are cleared after enrichment, so re-runs are idempotent.

2. **`migratedRecordMap` was undeclared** — RESOLVED (would throw on any migration run).

3. **`db.js` called a nonexistent `global.toast`** — RESOLVED
   - Replaced with a `window.onSpideyDBVersionChange` hook; app.js registers it
     (toast + graceful reload) for multi-tab versionchange events.

4. **`open()` return-shape regression** — RESOLVED
   - `open()` again resolves to the raw DB handle (`withStores`/`addTracks`
     depend on it); migration outcome exposed as `dbPromise.migration` instead.

## P1 — resolved this pass

5. **Duplicate detection is now content-based** — SHA-256 (`contentHash`) computed
   per imported file and stored on the record; `addTracks` rejects by fingerprint
   **and** content hash, including within a single batch. Null-safe when Web
   Crypto is unavailable (non-secure origins) — falls back to fingerprint-only.
   Legacy (v1) records get their hash during post-upgrade enrichment.

6. **`style.css` had an unclosed `@media (max-width: 767.98px)` block** — RESOLVED
   - Every rule after it (`.track-row`, toasts, drop overlay, scrollbars,
     reduced-motion, spinner) was scoped mobile-only; desktop rendered unstyled
     rows/toasts. The query now closes correctly; brace depth verified 0.
   - Dead `<i>`-era rules (`.toast > i` colours, `.drop-overlay-inner i`) removed;
     replaced with `.toast > svg` colour variants matching the SVG icon system.

7. **Cover-cache eviction could revoke the on-screen URL** — RESOLVED
   - `coverUrlFor()` now never evicts `currentCoverKey` (re-inserts it as
     most-recent). `applyCover(null)` no longer revokes shared cached URLs that
     sibling tracks may still reference.

8. **Visualizer/performance** — RESOLVED
   - Per-frame `createLinearGradient` (128 objects/frame) replaced with one
     shared gradient rebuilt only on resize.
   - RAF loop refuses to start without an analyser (no more 45 wasted idle
     frames per play when Web Audio is unavailable).
   - `visibilitychange` stops the loop while the tab is hidden and resumes on
     return while playing.
   - `prefers-reduced-motion` now also gates the JS beat-scale on album art
     (CSS alone only covered the animations), via a cached `matchMedia`.

9. **Progress slider ARIA mixed units** — RESOLVED
   - `aria-valuemin/max/now` are seconds (not a percent max-100 with percent
     now), `aria-valuetext` reads "m:ss of m:ss" or "Not loaded".
   - `setProgressUI` no longer writes percent into `aria-valuenow`.

10. **Import UX** — RESOLVED
    - The live progress toast now updates in place (`toast()` returns
      `{dismiss, update}`; the old code called the dismiss function as if it
      were an updater — imports failed outright until fixed and verified live).
    - Long filenames middle-truncated (`truncateMiddle`, 42 chars) in the
      status line.
    - Non-audio rejection messages list the supported formats.

11. **Safe deletion with undo** — RESOLVED
    - `removeTrack` shows a toast with an inline **Undo** action (8 s window).
      Undo calls new `SpideyDB.restoreTrack(record)`, which re-puts the exact
      record (same uid, blob, addedAt) and its cover. Verified end-to-end in a
      real browser: 3 rows → delete → 2 rows + Undo → restore → 3 rows, no errors.
    - Removal is also announced via the SR live region.

12. **Search empty state has a recovery action** — RESOLVED
    - "Clear search" button resets the filter and refocuses the field.

13. **Playlist row labels** — RESOLVED
    - Current row announces "Pause" only while actually playing (was "Pause"
      even when paused).
    - Removed the manual Enter/Space keydown handler — native `<button>`
      activation already provides it (double-fire risk otherwise).

14. **Volume UI** — RESOLVED
    - `level` hoisted out of the `if (icon)` block (was a ReferenceError risk
      when the SVG was missing).
    - Three-tier icons: muted (speaker + cross), low (speaker), high (speaker +
      one wave), full (speaker + two waves).

15. **Media Session** — RESOLVED
    - `play/pause/previoustrack/nexttrack/seekbackward/seekforward` handlers
      wired once at boot (lock-screen / OS media keys now control the player).
    - Metadata cleared when no track is loaded.
    - `prevTrack` restart-seek now refreshes the progress UI.

16. **Multi-tab IndexedDB** — RESOLVED
    - `db.onversionchange` closes the connection, resets the open cache, and the
      app hook shows a toast and reloads after a short delay.
    - `onblocked` already rejects with an actionable message.

17. **Honest storage messaging** — RESOLVED
    - Storage usage line reads "X of Y" (usage/quota) + "persistent" when granted.
    - When `navigator.storage.persist()` is declined, a one-time toast states the
      library may be evicted under storage pressure.
    - Boot loading state says "Opening your local library…" (was the wrong term
      "Connecting to local storage" — it is IndexedDB).
    - DB-failure screen explains consequences and a real fix ("your songs are
      not lost — close other tabs and retry") with a Retry button.

18. **Cover keys namespaced** — `hashBytes` keys now prefixed `v1-` so they can
    never collide with the new SHA-256 hex content hashes.

## P2 — resolved this pass

19. **id3.js `parsePicture` precedence bug** — `a && b || c` evaluated as
    `(a && b) || c`; parenthesised correctly, plus bounds checks after the
    picture-type byte and description.
20. **FLAC PICTURE bounds validation** — every length field is checked against
    the block end before advancing (corrupt files can no longer produce
    out-of-range subarrays).
21. **ID3 multi-value text** — ID3v2.4 NUL-separated values now yield the
    first value only (was leaking terminators into titles).
22. **Dead code removed** — `clearAll()`, `searchKey()` (data + docs + index
    hint), `fingerprint` export, unused `tx` param in `pruneCovers`, icon-map
    aliases (`volume-off`, `repeat-1`, `times`, `magnifying-glass`), broken
    `volume-xmark`/`step-*` paths replaced with accurate geometry.

## Verification matrix

| Area | Result | Evidence |
|---|---|---|
| Unit tests | PASS 9/9 | `npm test` — id3 tag parsing incl. new FLAC bounds paths |
| CSS build | PASS | `npm run build` — Tailwind → dist/tailwind.css |
| Browser E2E | PASS 26/26 | `npm run verify` — import, tags, cover, dedup, playback, a11y, reduced-motion |
| Undo delete | PASS | live test: 3→2→3 rows, "Track restored.", 0 page errors |
| Syntax | PASS | `node --check` on app.js, db.js, id3.js |
| CSS structure | PASS | brace depth 0; 4 balanced media queries |
| IndexedDB migration | PASS (code path) | self-contained transactions; no deadlock; idempotent |
| Multi-tab versionchange | PASS (code path) | handler closes DB, notifies, reloads |
| Desktop styling regression | FIXED | `.track-row`/toast rules back at top level |

## Known limitations (documented, not blocking)

- Content-hash dedup requires a secure context (HTTPS/localhost) for
  `crypto.subtle`; insecure origins fall back to fingerprint-only dedup.
- Migration identity continuity is code-verified but not yet exercised against
  a real v1 database dump.
- No automated axe-core scan; browser verify carries the manual a11y assertions.
- No real-device mobile verification (iOS Safari / Chrome Android) or
  cross-browser matrix (Firefox, Safari, Edge) yet.
- GitHub Pages / Netlify deploys not verified; Vercel deploy verified earlier
  (`https://spidey-player-hbisth6yp-subahdeepmistri.vercel.app`).

## Release status

**FUNCTIONALLY STRONG, BUT FINAL RELEASE VERIFICATION INCOMPLETE**

Not PRODUCTION READY until the release gates above (axe scan, real devices,
cross-browser matrix, remaining deploy targets) are actually exercised.

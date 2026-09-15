# Phase 8 — Verification (partial)

## Render-path vs source (after F-01, F-02, F-04, F-07, store.js)

| UI | Expected | Status |
|----|----------|--------|
| Title/artist/album | `tracks[currentTrack]` | Unchanged, OK |
| Times | finite → clock; else `–:––` | F-04 done |
| Count | playable length | Unchanged |
| Storage | `Site ·` estimate | F-02 done |
| Hide toast | stays hidden until undo | F-01 done |
| Empty catalog copy | `catalogOk` not Promise | F-07 done |
| Prefs/session/hidden | `SpideyStore` same keys | Phase 4; data not wiped |

## Edge cases
- Corrupt JSON: store.parse → fallback. Covered by `test/store.test.js`.
- Quota: CustomEvent + prefs toast. Hidden still in-memory.
- Two tabs: `storage` subscribe exists; app.js does not yet reload prefs from it (F-09 deferred).
- F-06 Android notification: code in v12; **not re-tested on iQOO this run.**
- Midnight: N/A.

## Behaviour changes (approved defects only)
- Unknown duration token
- Hide copy
- Storage prefix
- Empty-state catalog flag

## Residual
- F-03 hang of “Opening your local library…” if IDB never resolves
- F-05 hidden count in header
- F-09 live cross-tab prefs
- F-10 lazy blobs
- Device lock-screen retest
- `npm run verify` not run in this pass (Playwright)

## DoD
FR-05, FR-07, FR-08, FR-09 addressed in code. FR-13 device residual.

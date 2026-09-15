# Phase 1 — Findings

Each ID is the handle later phases use. Behaviour may change only for items you treat as defects. **Recommended defect set for later approval:** F-01, F-02, F-03, F-04 (honesty of displayed values). Others are quality/architecture unless you promote them.

---

## Display / trust defects

### F-01 — Hide-bundled copy lies about persistence
- **Mechanism:** `hideBundled` writes titles to `localStorage['spidey.hidden.v1']` (`app.js` 1415–1424). Toast at 1248: `it returns next session.` Comment at 1229–1230: “hides it for the session.”
- **Why it looks fine:** undo still works in the same sitting; casual testers never reload.
- **Edge:** refresh, new tab, reinstall PWA — track stays gone with no UI saying the library is filtered.
- **Fix:** either make hide session-only (`sessionStorage`) **or** keep localStorage and change copy to “Hidden. Undo or it stays hidden.” Prefer durable hide + honest copy (user who hid 20 tracks does not want them back on refresh).
- **Severity:** P1 trust. **Blast:** all bundled hides. **Cost:** toast + comments; optional settings “restore hidden.”

### F-02 — Storage line is not library size
- **Mechanism:** `refreshStorage` → `SpideyDB.storageInfo` → `navigator.storage.estimate()` (`db.js` 587–599, `app.js` 1509–1520). Includes SW caches, blobs, anything on the origin.
- **Why it looks wrong:** user imports one song and sees tens of MB “used” (PWA cache + catalog). Or sees 0 if estimate unsupported (`textContent = ''` — indistinguishable from “not shown”).
- **Fix:** label it “This site” / show “Library: N imported tracks” computed from IDB rows; if estimate missing, show “Storage size unknown”, never blank.
- **Severity:** P2. **Blast:** playlist footer only.

### F-03 — Boot status string can outlive boot
- **Mechanism:** `el.importStatus.textContent = 'Opening your local library…'` (~1820) then cleared in `reloadLibrary` (~1495). If `open()` hangs or `getAllTracks` never settles, the line stays forever and looks like an import in progress.
- **Fix:** timeout + “Couldn’t open library” vs empty vs loading; never reuse importStatus for boot without a distinct state.
- **Severity:** P2. **Blast:** `#import-status` only.

### F-04 — Duration holes
- **Mechanism:** bundled `duration: t.duration || NaN` (1460). `playlistRow` only prints time if `Number.isFinite(track.duration) && track.duration > 0` (~1098). `#duration` uses `formatTime(track.duration)` on load then `audio.duration` after metadata. Empty string vs `0:00` vs missing — three meanings, two of them look like “no time.”
- **Fix:** show `–:––` for unknown (not `0:00`); fill from `audio.duration` for bundled too (display only, no IDB write).
- **Severity:** P2.

### F-05 — Track count vs shipped catalog
- **Mechanism:** count is `tracks.length` after hidden filter. Catalog `count: 177` is never shown. Hiding 5 songs shows “172 tracks” with no “5 hidden.”
- **Fix:** if `hidden.size`, show “172 tracks · 5 hidden” with restore.
- **Severity:** P3. Related to F-01.

### F-06 — Media notification missing on Android (addressed in v12, verify)
- **Mechanism:** `createMediaElementSource` captured the element (`app.js` ensureAudioGraph). Android Chrome then omits the media notification. v12 skips Web Audio on Android and sets Media Session playbackState/position/artwork.
- **Status:** code present; **not re-verified on device in this audit.** Keep as residual until Phase 8 device check.
- **Severity:** P1 if still broken on iQOO.

---

## Edge cases (checked against code)

| Case | What happens today |
|------|-------------------|
| Empty IDB, catalog present | Bundled list plays; count 177. OK. |
| No catalog, empty IDB | Empty state; `loadCatalog()` is a Promise object (always truthy) so empty copy may say “or click Import” even when catalog fetch failed (`app.js` 1059–1061). **F-07.** |
| Corrupt prefs JSON | `loadPrefs` catch → `{}`. OK. |
| Corrupt session JSON | `null`. OK. |
| Corrupt hidden JSON | empty Set. Hidden tracks reappear. OK-ish. |
| Quota on prefs | toast once. Hidden/session silent. **F-08.** |
| Two tabs | IDB versionchange closes DB; no `storage` listener for prefs — last write wins. **F-09.** |
| Private browsing IDB | open() reject → boot catch. Need to confirm user-visible error. |
| `duration` NaN in DOM | skipped in list; `formatTime` maps non-finite to `0:00` (`app.js` ~103). Clash with F-04. |
| Rapid import | same-tab sequential; multi-tab race documented in AUDIT.md. |

### F-07 — Empty-state catalog check is wrong
`loadCatalog() ? 'or click Import' : '…unavailable'` — `loadCatalog()` returns a Promise, always truthy. The unavailable branch is dead. **Severity:** P2.

### F-08 — Silent localStorage failures on session/hidden
Only prefs toast. Session resume can vanish without notice. **Severity:** P3.

### F-09 — No cross-tab prefs/session sync
Two phones-as-tabs not typical; two desktop tabs are. **Severity:** P3.

---

## Code quality (file:line)

1. **Architecture:** `app.js` (~2100 lines) is UI + playback + PWA + persistence calls. No boundary. `SpideyDB` is the only clean seam.
2. **Duplication:** `removeTrack` bundled vs imported nearly copy-pasted (1231–1270). Icon path strings in HTML placeholders and `updatePlayButton`.
3. **Performance:** `highlightCurrent` re-renders the whole playlist on every play/pause (1214–1218). Fine at 177; not at thousands of imports.
4. **Scalability:** `getAllTracks` loads every blob into RAM. Large import libraries will OOM. Catalog avoids this (URLs only).
5. **Maintainability:** comments contradict hide persistence; `window.play`/`window.pause` wrap in `setupWakeLock` (2020–2033) is a footgun.

### F-10 — `getAllTracks` hydrates every blob
Every imported file is in memory after boot. **Severity:** P2 for big libraries; not for current bundled-first use.

---

## Most robust fixes (not the smallest)

| ID | Robust fix | Cost |
|----|------------|------|
| F-01 | Keep durable hide; honest toast; “Hidden tracks” restore in playlist header | Small |
| F-02 | Separate “Imported n” from optional origin estimate, labeled | Small |
| F-03/F-07 | Explicit boot/import/empty enum into one status component | Medium |
| F-04 | Unknown duration token `–:––`; update from element | Small |
| F-08/F-09 | Single `storage` module: versioned JSON, `storage` event, quota toast | Medium — Phase 4 |
| F-10 | Lazy blob: store metadata in IDB, get blob by uid on play | Large — later |

**Rejected:** wiping hidden on load (loses user intent). **Rejected:** putting MP3s in localStorage (impossible).

---

## Stop

Findings F-01–F-10. Proposed defect fixes to implement when coding starts: F-01, F-02, F-04, F-07 (honesty). F-03 with them. F-08/F-09 in Phase 4 layer. F-06 verify only. F-05, F-10 unless approved as features.

Phase 2 documents next.

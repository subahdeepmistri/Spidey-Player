# SRS — Spidey Player

Client-only. Anything called “security” here is UI/integrity, not a server guarantee.

IDs cite Phase 1 where they exist because of a finding.

## Functional

| ID | Requirement | Test |
|----|-------------|------|
| FR-01 | Bundled catalog tracks play from `track.src` without IDB. | Boot with empty IDB; play first row. |
| FR-02 | Imported files persist in IndexedDB and survive refresh. | Import one MP3, reload, it remains. |
| FR-03 | Prefs (volume, mute, shuffle, repeat) persist in `spidey.prefs.v1`. | Change repeat, reload, still on. |
| FR-04 | Session `{uid, pos}` restores on boot. | Play 30s, reload, position ≈ 30s. |
| FR-05 | Hide bundled writes `spidey.hidden.v1` and **copy matches that** (F-01). | Hide, read toast, reload, still hidden. |
| FR-06 | `#track-count` equals playable `tracks.length` (and search subset). | Hide one; count drops by one. |
| FR-07 | Progress bar and times come from `HTMLAudioElement`, unknown ≠ `0:00` (F-04). | Track with NaN duration shows unknown token until metadata. |
| FR-08 | Storage footer does not imply “library bytes” unless it is (F-02). | Label “Site storage” or show import count. |
| FR-09 | Empty library copy uses catalog **result**, not the Promise (F-07). | Mock failed catalog fetch. |
| FR-10 | Import status only while importing; boot uses a distinct or timed message (F-03). | |
| FR-11 | Delete imported track removes IDB row; undo restores blob+cover. | |
| FR-12 | Search filters title/artist/album/name client-side. | |
| FR-13 | Media Session play/pause/next/prev/seek on supporting browsers. | |

## Roles / permissions
Single local user. No auth. **UI convention only:** anyone with the origin can read IDB in DevTools.

## Business rules
- Bundled tracks are not deleted from disk; hide is a filter.
- Cloud catalog may point at Blob URLs; local catalog at `assets/music/`.
- iOS cannot play FLAC; catalog is MP3.

## Data
See Phase 0 persistence table. Validation: JSON.parse guarded; IDB upgrade v1→v2 must keep blobs.

## Error handling
- IDB blocked: user-visible, not a spinner forever (F-03).
- Quota: toast (extend to session/hidden — F-08).
- Decode error: toast with title.

## Edge cases
Phase 1 table. Midnight N/A (no date goals). Two tabs: last prefs write wins until Phase 4 `storage` event.

## Security (honest)
- XSS: titles via `textContent` (keep).
- No CSP beyond host headers.
- No secrets. Blob URLs are public on the cloud pack.

## Performance
177 bundled URL tracks must boot without reading 1.5 GB into IDB. Imports may load blobs into RAM today (F-10, deferred).

## Acceptance
Each FR is pass/fail in a browser. Phase 8 will tick them.

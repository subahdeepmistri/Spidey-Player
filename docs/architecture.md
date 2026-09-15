# System architecture — Spidey Player

## Stack (keep)
Vanilla JS, CSS, HTML. IndexedDB for blobs. localStorage for JSON. Static host (Vercel) + optional Blob CDN for audio.

**Rejected:** React, Vue, a fake REST layer, putting audio in localStorage.

## Client-side “backend”
`SpideyDB` is the media repository. A thin `SpideyStore` (Phase 4) will be the **only** module that calls `localStorage` for JSON keys. Features call `SpideyStore.load/save/subscribe`, not `localStorage` directly.

Forward-compat: `SpideyDB.getAllTracks` could later fetch `/api/library` metadata while blobs stay local. Cost: rewrite of `addTracks` only if uploads appear — not planned.

## Components
- **Playback** — one `HTMLAudioElement` in the document.
- **Library** — merge catalog + IDB in `reloadLibrary`.
- **UI** — now-playing + playlist drawer.
- **SW** — cache shell; catalog network-first.
- **Pipeline** — Node scripts, not runtime.

## Data flow
Unchanged from Phase 0 mermaid. Phase 4 inserts `SpideyStore` on the localStorage arrows.

## Storage
| Kind | Tech | Why |
|------|------|-----|
| Audio blobs | IndexedDB | Only viable browser store |
| Prefs/session/hidden | localStorage via SpideyStore | Small JSON |
| Bundled files | HTTP static / Blob | No duplication into IDB |

## Security
XSS hygiene, no auth. Public cloud MP3s.

## Deploy
Static `.cloud/` to Vercel; `prepare-cloud-catalog.js` swaps catalog. Monitoring: none (Hobby). Scalability: catalog URLs scale; IDB getAll does not (F-10).

## What a server would buy
Sync across devices, private audio, quota beyond the browser. Not in scope; do not stub APIs.

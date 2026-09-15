# PRD — Spidey Player

## Problem
People want a local music player in the browser that does not upload their files. Spidey Player ships a bundled Taylor Swift library and lets users import more. The UI must report **true** library size, playback position, and hide/import status. Today a few labels disagree with storage (see Phase 1 F-01, F-02, F-04, F-07).

## Target users
- Primary: the owner (Subhadeep) on Mac and Android Chrome / installed PWA.
- Secondary: anyone opening the public URL; they get the cloud catalog (Blob URLs), not the 1.5 GB local files.

## Goals
1. Playback of bundled + imported audio without a server.
2. Displayed counts, times, and status match stored/live data.
3. Survive refresh: prefs, position, hidden bundled tracks (honestly labeled).
4. Usable on a phone viewport (already in progress).

## Core features (existing — preserve)
- Play/pause, skip, seek, shuffle, repeat, mute
- Playlist search, import, delete/hide
- Album art from catalog or ID3
- PWA install, Media Session on Android
- Session resume

## MVP scope
The current app **is** the MVP. This audit does not add a backend, accounts, lyrics, or cloud sync.

## User stories
- As a listener I see how many tracks are in the list I can actually play.
- As a listener, if I hide a shipped track, the UI tells me it stays hidden until I undo.
- As a listener I see elapsed/remaining time or an explicit unknown, never `0:00` for “unknown.”
- As an importer I see `Reading n/m` only while files are being read.

## Success metrics
- Every Phase 0 render-path value matches its source after Phase 6.
- `npm test` and `npm run verify` stay green.
- No IndexedDB wipe; existing `MusicAppDB` records still play.

## Assumptions
- Chrome/Android and desktop Chromium are the real targets.
- Bundled audio on Vercel is the Blob subset; local `npm start` is full quality.

## Risks
- IndexedDB vs “localStorage only” brief — resolved: keep IDB for blobs.
- Service worker caching stale catalog — already network-first.

## Out of scope
Server, login, multi-user, recommendation, equalizer product, rewriting to React.

## Proposed features (not approved unless you say so)
- **P-A** Hidden-track manager in the playlist header (depends on F-01/F-05).
- **P-B** Export/import of library metadata (not audio blobs) for backup.
- **P-C** Lazy-load import blobs (F-10). Defer.

## Acceptance
- F-01 toast and comments match localStorage hide.
- F-02 storage line labeled or replaced with imported-count.
- F-04 unknown duration is not `0:00`.
- F-07 empty copy does not use a Promise as a boolean.

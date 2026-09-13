# 🕷️ Spidey Player 2.0

A cyber-glass web music player. Local-first: your library lives in the browser's
IndexedDB, tags are read from the files themselves, and the frontend ships with
**zero runtime dependencies**.

![Spidey Player](image/862eb376cc18fd124f045f6b31b0dc4b.jpg)

## Features

**Library**
- **Reads real tags** — title, artist, album, track number and embedded cover art
  from ID3v2.2/2.3/2.4, ID3v1 and FLAC (Vorbis comments + `PICTURE` blocks). No
  dependencies; only the tag region of a file is read.
- **Persistent** — songs are stored in IndexedDB and survive refreshes and restarts.
  The player asks the browser to make the data persistent so it is not evicted.
- **Safe duplicate handling** — re-importing the same file is detected by
  name + size + timestamp *and* a SHA-256 content hash, so a renamed or
  re-downloaded copy of a song you already have is also recognised. Two
  *different* songs that happen to share a filename are both kept (the old
  version silently overwrote one).
- **Per-track management** — remove a single song (with Undo); orphaned cover art is pruned.
- **Drag & drop** with a full-screen drop overlay, or the Import button.

**Playback**
- Shuffle (a real Fisher-Yates order, with history — back goes back).
- Repeat off / all / one, persisted between sessions.
- Volume slider + mute, persisted between sessions.
- Scrub the progress bar by click or drag; keyboard-seekable.

**Visuals**
- Real-time frequency-bar visualizer (Web Audio API), sized to the viewport.
- Album art that reacts to the beat, with an idle pulse.
- The render loop stops itself when the music is silent — an idle player costs
  nothing.

**Accessibility**
- Every control has an accessible name; toggles expose `aria-pressed`.
- The progress bar is a real `role="slider"` with `aria-valuetext`.
- Status changes are announced through a polite live region.
- Visible focus rings, a skip link, and `prefers-reduced-motion` support.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Seek ∓5s |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `N` / `P` | Next / previous track |
| `L` | Toggle the playlist panel |
| `/` | Focus search |
| `Esc` | Close the panel / clear search |

Shortcuts never fire while you are typing in a text field.

## Getting started

```bash
npm install
npm run build:css     # compile Tailwind -> dist/tailwind.css
npm start             # serve on http://localhost:3000
```

Then drag audio files onto the page, or use **Import**.

> `dist/tailwind.css` is generated. Re-run `npm run build:css` after editing
> `index.html` or `src/tailwind.css`, or run `npm run watch:css` while developing.

## Testing

```bash
npm test              # 9 unit tests for the tag reader (parses the real library)
npm run verify        # 26 end-to-end assertions in a real headless Chromium
```

`npm run verify` needs a Playwright Chromium:

```bash
npx playwright install chromium
# or point at an existing binary:
CHROME_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium" npm run verify
```

## Tech stack

| Layer | Choice |
|---|---|
| UI | Vanilla JavaScript (ES5-safe syntax, no framework) |
| Styling | Tailwind CSS (compiled locally) + custom CSS |
| Audio | Web Audio API + HTML5 `<audio>` |
| Storage | IndexedDB (v2, with automatic migration from v1) |
| Metadata | Hand-written ID3v1 / ID3v2 / FLAC parser |

No runtime dependencies. `tailwindcss` and `playwright-core` are dev-only.

## Project layout

```
index.html            markup + ARIA wiring
app.js                player state, UI, keyboard, drag & drop, visualizer
db.js                 IndexedDB v2 + v1 migration
id3.js                ID3v1 / ID3v2 / FLAC tag reader
style.css             glass / component layer
src/tailwind.css      Tailwind entry point
dist/tailwind.css     compiled (generated)
test/                 unit + browser tests
AUDIT.md              full audit: every defect found, its evidence and its fix
```

## Notes on stored data

Your library lives in this browser's IndexedDB for this origin. It is not synced
anywhere. Clearing site data removes it. Test fixture audio is in
`test/fixtures/audio/` and is used by the browser verification suite.

## Credits

Developed by **Subhadeep Mistri**.

See [AUDIT.md](AUDIT.md) for the full engineering audit behind this version.

# Phase 3 — Target architecture

## Folder tree (rationale)

```
music app/
  index.html          # shell only
  app.js              # UI + playback orchestration (keep; split later if >3k lines)
  store.js            # NEW — only localStorage JSON (Phase 4)
  db.js               # IndexedDB blobs — unchanged contract
  id3.js              # tags
  sw.js / style.css / manifest.json
  assets/             # catalog + art + music
  scripts/            # build-time only
  docs/               # this audit
  test/
```

**Rejected:** `src/domain`, `src/ui` React tree. Cost high, behaviour risk high, user asked for trust of numbers not a rewrite.

## Layers
| Layer | May import | Must not |
|-------|------------|----------|
| `store.js` | `localStorage` | DOM, IDB, audio |
| `db.js` | IndexedDB | localStorage, DOM |
| `id3.js` | nothing | storage, DOM |
| `app.js` | store, db, id3, DOM | raw `localStorage` after Phase 4 |

## Refactor order
1. Add `store.js` with same key names — no behaviour change.
2. Point `app.js` at it — still no behaviour change (verify prefs still load).
3. Then F-01/F-02/F-04/F-07 as **separate** edits.

## What gets better
Call sites stop sprinkling `JSON.parse`. Quota and corrupt JSON handled once. Cross-tab subscribe ready (F-09) without rewriting features.

## How you’d notice
You wouldn’t, until defect copy/labels change in step 3.

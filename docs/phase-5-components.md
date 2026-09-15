# Phase 5 — UI “components”

This app is vanilla DOM, not a component library. Treat these as the system:

| Piece | Role | Loading / empty / error |
|-------|------|-------------------------|
| `.player-card` | Now playing | Title/artist from track; unknown duration `–:––` |
| `.player-dock` | Transport | Disabled seek via aria when no duration |
| `.panel` / `#playlist` | Library | Empty state + Import; search miss + Clear |
| `.search-field` | Filter | Icon inside field |
| toast | Feedback | Quota / hide / import |
| `#import-status` | Boot + import | Distinct strings |
| `#track-count` | Playable size | `n tracks` or `v of n` |
| `#storage-usage` | Origin estimate | Prefixed `Site ·` |

**Convention:** no innerHTML for titles; `textContent` only. Prefer composition in HTML over flags.

No new widget framework (rejected vs React).

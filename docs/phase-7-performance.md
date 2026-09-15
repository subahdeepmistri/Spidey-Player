# Phase 7 — Performance

Measured mentally against 177 bundled URL tracks (no blob decode on boot).

| Area | Verdict |
|------|---------|
| Playlist full re-render on play | Cheap at 177 rows. No virtualize. |
| `getAllTracks` blobs | Cost is **imported** files only. Bundled path is URLs. Leave F-10. |
| Visualizer rAF | Stops when tab hidden. Android skips Web Audio (F-06). |
| SW | Catalog network-first; not a render bug. |

No speculative memoization. No code change in this phase.

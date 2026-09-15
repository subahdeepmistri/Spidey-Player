# Development plan

## Sequence (app stays runnable)

1. **Phase 4** — `store.js` wraps localStorage (prefs, session, hidden, banner). Migrate in place (same keys). Tests for corrupt JSON.
2. **Phase 6.2 defects** (not mixed with the store file’s first commit if possible; store first then call-sites):
   - F-01 honest hide toast
   - F-02 storage label
   - F-04 `–:––`
   - F-07 catalog empty copy
   - F-03 boot status timeout
3. **Phase 3/6.1** — do **not** explode `app.js` into a framework. Optional later split `playback.js`. Rejected for this pass: full folder rewrite would churn without user-visible gain (ponytail).
4. **Phase 5** — no React library. Document existing DOM pieces as the component system.
5. **Phase 6.3 features** — none unless approved (P-A hidden manager).
6. **Phase 7** — measure playlist re-render; skip virtualization at n=177.
7. **Phase 8** — FR table + edge cases.

## Definition of Done
- FR-01–FR-13 checked or explicitly deferred
- `npm test` 9/9
- `node --check` on edited JS
- Existing IDB data plays
- Displayed count/time/status match sources
- No new localStorage keys without migration from `.v1`

## Priority
Data honesty (F-01, F-04, F-07, F-02) before cosmetics.

# P09-F05 evidence workspace and inspection

The Evidence sources workspace filters the authorized relationship list by claim and relationship. Its citation drawer uses a native modal dialog with a named heading, keyboard dismissal, focus restoration, and a scrollable exact-source panel. The drawer shows the selected claim revision alongside source version, effective time, checksum, and exact authorized content. Existing refresh, offline, and visibility checks clear the drawer and its payload.

The existing source GET route accepts an optional relationship filter for list requests. It returns available relationships within the authorized scope and removes unavailable links from the public list. Exact inspection of a missing, inaccessible, or stale edge returns the same generic 404 after scope checks. The established access ledger and audit events record authorized reads and denials. Denial records omit guessed edge identifiers.

This is a local synthetic engineering change under schema 59. Qualified review remains pending for formal acceptance.

For an authorized list filtered by relationship, use `GET /api/evidence/sources?patient=ID&relationship=supported`. Exact inspection uses `edge=egs_UUID` on its own. Filter names are bounded to the existing relationship values. The existing source error and refresh flow clears cached content on a failed or changed read.


## Engineering verification

All 32 graph and ingestion tests passed, including stale and unknown lookup parity and audit records with no probed identifier. Targeted lint and the final optimized build passed.

The first browser run verified cross-owner response parity, relationship filtering through the API, and clearing drafts and exact evidence on offline, denied, cancelled, and late reads. Its drawer scenario exposed an ambiguous filter label. Explicit accessible names and bounded drawer sizing were applied. The final drawer regression passed with real persisted synthetic evidence on desktop and phone, including filter selection, the claim and source details, Escape, focus restoration, viewport bounds, and Axe checks.

Browser reports are under artifacts/governance-v2/P09-F05. The first run and its failure evidence are retained alongside the passing focused run.

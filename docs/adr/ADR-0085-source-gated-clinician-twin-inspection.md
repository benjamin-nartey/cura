# ADR0085 — Source-gated clinician Twin inspection

Status: local design decision; qualified review pending.

Separate bounded read-only clinician inspection from source capture/operations. Reuse F02 source-reproduced state, source inspection and P07 clinical comparison; no duplicate materialization or new migration. Source-pinned signed cursors bind session, actor/context, build and complete source inventory. Do not render patient-specific Twin data on server pages until source authorization succeeds. Stale/unbuilt/failed state cannot produce counts, lists or comparisons that look healthy. Native uses the same domain through the existing bearer-only mobile boundary.

Retain prior controls and regression oracles at /twin/sources, linked from the clinician workspace. All current/historical evidence reauthorizes original sources, validates exact pointers and never reconciles facts or changes source data. Comparison is clinical timeline only; pending work uses existing kind-specific source authority and links. Qualified review/production readiness remain unclaimed; stop before Phase09.

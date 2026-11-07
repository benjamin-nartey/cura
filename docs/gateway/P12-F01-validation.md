# P12-F01 Scoped read-only copilot context

An active clinician in a treatment session can inspect source availability from the patient chart or through `GET /api/copilot/context?patient=PATIENT_ID`. The server rechecks the clinician role and patient access. The twin, timeline, and evidence graph each enforce their own source permissions. The API response uses a versioned contract and disables caching.

The preview considers source versions recorded in the last 90 days and returns up to 24 references per source. It excludes historical timeline versions, stale twins, and data outside the requested patient scope. Each reference contains an opaque fingerprint and version. The response omits chart values, narratives, patient identifiers, and claim text. Unbuilt, stale, empty, unavailable, and timed-out sources have distinct status values. Truncated sets are marked.

Assembly uses a two-second cooperative deadline. A synchronous SQLite read can finish after that deadline, in which case its result is discarded. The endpoint assembles an ephemeral preview from existing persisted sources and audits the scoped read. Schema 63 stays compatible. The existing copilot summary and question flows retain their prior behavior. The preview carries no provider dispatch capability.

Qualified review of the window, source permissions, and any future provider use remains pending.

Four focused domain tests passed. They covered wrong role, forged role, cross-tenant access, an empty second patient's context, a corrected source version, an unavailable source, and the existing copilot flows. Web type checking and gateway boundary lint passed. A signed-in Playwright check verified the chart preview, the versioned API response, and a cross-tenant refusal. Logs and a screenshot are in `artifacts/governance-v2/P12-F01`.

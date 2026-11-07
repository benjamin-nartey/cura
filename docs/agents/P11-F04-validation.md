# P11-F04 Human approval tasks

Chart review parks at a durable approval checkpoint. A second treatment clinician or nurse at the same facility can open the task from the Review inbox. The server rechecks the manifest, scope, separation of duties, deadline, and parked checkpoint. Approval resumes the parked step and records the review outcome in the same transaction. It grants no chart write. Decline closes the run.

The local review window is 24 hours from the stored request time. Expired tasks are omitted from the inbox. The next scoped read or decision attempt records expiration, closes the parked step, and writes a single audit and outbox event. A late decision is rejected even if it arrives before that expiration record is materialized. Schema 62 represents an expired task as a terminal decline without a human decider. The API and workspace display it as expired.

Decision receipts are bound to the reviewer and command. Run context and source references use the existing scoped view and patient-relationship checks. The SQLite decision and checkpoint transaction is the durable handoff after Temporal parks the run.

Seven focused agent tests passed, including approval recovery after reopening SQLite, separation of duties, inbox scoping, and single-record expiration. Web type checking and gateway boundary lint passed. A signed-in Playwright check opened a fresh request from the second reviewer's inbox and approved it. Evidence is under `artifacts/governance-v2/P11-F04`. Qualified review and prerequisite phase acceptance remain pending.

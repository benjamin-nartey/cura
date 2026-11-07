# P08-F01 hazards and controls

Conservative risk C. Local synthetic source-evidence use only; qualified signoffs remain pending, production clinical functions disabled.

- Wrong/current-versus-historical facts: immutable exact ledger/version/SHA pins, current source hash, stale facts withheld and separately reauthorized historic inspection. No active/recent/pending predicates or silent clinical reconciliation in F01.
- Permission leakage: clinical history gate plus per-source reads, independent work-history permission, source coverage and owner/org/facility/patient/purpose binding. Referral history follows actual service visibility across authorized sending/receiving parties. Revocation changes coverage and hides old captures. No client-supplied source versions/payloads are captured. Historical work must still belong to the selected patient's authorized inventory; a forged derived digest cannot transfer another patient's source into the view.
- Fake risk/medication/care-gap interpretation: source-recorded statuses only; medication drafts labeled drafts. Risk is explicitly unassessed with no score/signals. Missing data is not a normal finding. Existing legacy state remains separate.
- Partial/tampered capture: atomic transaction, ledger FKs, immutable rows, member count/digest, unique IDs/records, scoped idempotency, monotonic capture versions and competing-process tests. Corrupt or missing source history fails closed.
- Offline/late response: patient-keyed context, synchronous epoch visibility guard, aborts, no local clinical storage, explicit reconnect refresh and no queued/replayed capture commands. Cancellation acknowledges a committed capture may remain.
- Resource/retention pressure: bounded source/member reads and capture quota, no silent truncation or cleanup deletion. Deployment retention, erasure, residency, subject-rights workflows and capacity need qualified review.
- Regression: preserve old PatientState APIs and all source rows/evidence; additive schema, failed-migration rollback and original-row checks, full domain plus actual web/mobile regressions. No production migration/deployment is authorized.

# Retention and legal holds

P03-F03 calculates retention for synthetic records and blocks disposal while a legal hold is active. Formal Phase 03 is not authorized. The seeded rules are simulation profiles named `SYNTHETIC_GH`, `SYNTHETIC_EU`, and `SYNTHETIC_DEFAULT`. They are not Ghanaian or European legal retention periods, and every synthetic policy is marked `pending_policy_approval`.

A future production schedule has to be read against the Ghana Data Protection Act, 2012 (Act 843), including the retention limit in section 24, the GDPR storage-limitation principle and erasure exceptions, NIST SP 800-88 Revision 2 for sanitization, and the privacy objectives in ISO/IEC 27001 and 27701. Implementing this feature does not establish compliance with those sources.

## Decision

`evaluateRetention` returns retain, review required, archive eligible, purge eligible, hold blocked, policy missing, policy conflict, or error. A missing or conflicting policy is not eligibility to delete. An unknown jurisdiction is not eligibility to delete. Expiry makes a record eligible only. Disposal still needs a stored preview and a second check.

The clock used for tests is `retention_controls.clock`. When it is unset, the service clock is the system time.

## Holds

A hold moves from draft to active to released. It does not expire on its own. The issuer cannot release it. Release does not delete the covered record and does not revive withdrawn consent. A hold created after a preview, or during a worker item, stops disposal of records that are not already disposed. Category scope covers later records in that category for the same organization.

## Workers

Archive copies a checksum into `retention_archives` and marks the operational row archived only after that write. If archive storage is marked unavailable, the operational row stays active. Disposal writes a tombstone and hides the row from active reads. The same idempotency key returns the completed job. A second key does not create a second tombstone. An interrupted job stays running and resumes from stored item outcomes.

Backups that copy a disposed row back to active are reconciled by `reconcileRetentionRestore`, which applies the tombstone again. That does not prove every backup copy in object storage has been sanitized.

## Audit and consent

Ledger rows are not deleted. Consent history is not deleted. A hold does not make a withdrawn consent active.

## API and UI

- `POST /api/privacy/retention/records`
- `POST /api/privacy/retention/policies/{id}`
- `POST /api/privacy/retention/dry-runs`
- `POST /api/privacy/retention/jobs`
- `POST /api/privacy/legal-holds`
- `POST /api/privacy/legal-holds/{id}/activate`
- `POST /api/privacy/legal-holds/{id}/release`

Screens are `/privacy/retention`, `/policies`, `/holds`, `/holds/new`, `/holds/{id}`, `/dry-run`, `/jobs`, `/jobs/{id}`, `/records/{id}`, and `/activity`.

## Risks

A missing policy, an unknown jurisdiction, a policy conflict, or an unavailable retention store stops destruction. A client cannot submit a list of ids to purge. Execution reads the stored preview and checks the current hold and policy revision again. The issuer of a hold cannot release it. Organization administrators, clinicians, and receptionists do not receive disposal or hold-release permissions.

The local archive is a checksum row in `retention_archives`. It is not an S3 or MinIO conformance claim, and it is not proof that backups, caches, or search indexes have been sanitized. `reconcileRetentionRestore` puts a restored active row back to disposed when a tombstone exists. That was exercised in the domain test. It does not scan external backup media.

Audit ledger rows and consent history are protected categories. No automatic deletion period is assigned to them. This implementation does not claim compliance with Act 843, GDPR, NIST SP 800-88, or ISO/IEC 27001 or 27701.

## Rollback

`RETENTION_ROLLBACK` drops the retention tables, removes schema version 35, and records version 34. The next open applies version 35 again.

## Runbook

1. An incorrect policy is corrected by saving a new version. Open previews become stale and cannot execute.
2. A deletion attempt without a current preview is rejected. Check the job item outcome before retrying.
3. A hold created during a purge blocks items not yet disposed. Already disposed rows stay disposed, with the tombstone as evidence.
4. A running job that stops can be resumed. Completed items are not repeated.
5. If retention data is marked unavailable, evaluation returns an error and execution throws. Restore the control to `available` before retrying. Do not delete from a stale allow.
6. Object storage used by other platform services is not the retention archive. The archive table is the local checksum store. An unavailable archive flag leaves the source row active.
7. A failed archive verification is the unavailable-archive outcome. Do not mark the source archived.
8. A checksum mismatch is a failed archive. Keep the operational row and investigate the archive table before retry.
9. If migration to version 35 fails, restore the last backup taken at version 34 and retry the upgrade.
10. After a database restore, run retention reconciliation so tombstones win over revived active rows.
11. A missing ledger event means the retention write did not commit. Do not repair the hash chain by deleting entries.
12. A mistaken release stays in hold history. It does not delete records. Create a new hold if preservation is still required.
13. Two active policies for one category return policy conflict and block destruction until one is superseded.
14. An expiry backlog is the set of active rows whose preview is eligible. Execute only a current preview.

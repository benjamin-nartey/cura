# DSAR and bulk export

P03-F04 tracks synthetic access, correction, portability, erasure, and administrative bulk-export requests. Formal Phase 03 is not authorized. The policies `SYNTHETIC_GH_DSAR`, `SYNTHETIC_EU_DSAR`, and `SYNTHETIC_BULK_EXPORT` are simulation profiles marked `pending_policy_approval`. A 30-day response figure and a 1000-record monitoring threshold are engineering test values, not approved legal deadlines.

Ghana’s Data Protection Act, 2012 (Act 843), Ghana Data Protection Commission guidance, GDPR Articles 12, 15, 16, 17, and 20, NIST privacy guidance, OWASP ASVS, and HL7 FHIR R4 plus Bulk Data were used as design references. Implementing this feature does not establish compliance or FHIR conformance. Where no approved production rule exists, the request stays in policy review instead of being disclosed.

## Identity

A requester must be signed in. A guardian request is accepted only when an authority row links that guardian reference to the subject, is active, and is not expired. Matching a name or email does not verify anyone. The wrong guardian, a revoked authority, and an expired authority fail. The subject cannot be changed by a client-supplied id.

## Approval and export

Records staff can submit and, when they are the authorized downloader, download. The privacy officer verifies and gives the first approval, and cannot approve a request they submitted. A large or bulk request then waits for the legal-hold administrator’s second approval. Generation rechecks the approved categories. Third-party payloads are stored as `[redacted]`. Research notes and held records are excluded. The artifact and manifest live in sqlite, not a public directory or an S3 bucket. A download fails when the permission, the downloader, the authority, the checksum, or the expiry is no longer valid.

The worker claims a queued job, writes batches of 500, and can resume after a stop. A second worker with a different token does not take over a running job. More included rows than the configured maximum block the artifact. Large jobs write monitoring alerts and an outbox event that contains only the kind, export id, and count.

## Correction and erasure

Correction updates the synthetic contact-preference row and keeps the previous payload. It does not edit the audit ledger or a clinical chart. Phase 04 clinical correction is not implemented.

Erasure writes a plan, then disposes only rows that are not held and not in a protected category. An active legal hold on the category blocks those rows. The result says partial when anything remains. The response also says archive and backup copies were not physically verified.

## API and UI

- `POST /api/privacy/requests`
- `POST /api/privacy/requests/{id}/verify`
- `POST /api/privacy/requests/{id}/approve`
- `POST /api/privacy/requests/{id}/deny`
- `POST /api/privacy/requests/{id}/correct`
- `POST /api/privacy/requests/{id}/erase`
- `POST /api/privacy/exports`
- `POST /api/privacy/exports/{id}/download`
- `POST /api/privacy/exports/{id}/revoke`

Screens are `/privacy/requests`, `/directory`, `/new`, `/{id}`, `/activity`, `/privacy/exports`, `/privacy/exports/{id}`, and `/privacy/exports/monitor`.

## Rollback

`DSAR_ROLLBACK` drops the privacy-request tables, removes schema version 36, and records version 35. The next open applies version 36 again.

## Runbook

1. A wrong-subject attempt is denied before an artifact is stored. Check the ledger action `privacy.export.denied` or `privacy.download` with outcome denied.
2. A suspicious bulk export appears on the monitoring screen and in the outbox as `privacy.export.monitor`. Revoke the export before download.
3. If artifact storage is suspected, revoke the export and clean expired payloads. The checksum check blocks a tampered artifact.
4. A failed verification leaves the request pending. Do not approve it.
5. An approval mistake is not self-service. A different reviewer is required for the elevated step. Denial is recorded.
6. A stopped worker leaves the job running. Run it again with the same worker identity. Completed items are not repeated.
7. A download is tied to the signed-in downloader. Revoke the export or the authority to stop later downloads. There is no public URL token.
8. Cleanup clears an expired payload unless a legal hold references that export, in which case the bytes stay and download stays off.
9. A legal hold blocks erasure of the covered category. Report the partial result. Do not delete the ledger to finish the request.
10. A correction keeps the prior synthetic value. If the wrong value was applied, submit a new correction. Do not edit ledger rows.
11. If an export contains another subject, generation throws and the download is denied. Revoke the job and review the manifest.
12. A complaint is handled as a new request. This software does not set a breach-notification deadline.
13. After a database restore, tombstones and revoked exports remain the source of truth for those rows. This does not prove every backup copy was sanitized.

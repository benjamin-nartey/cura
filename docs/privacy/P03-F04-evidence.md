# P03-F04 experimental evidence

This is experimental engineering evidence. Formal Phase 03 remains NOT AUTHORIZED. DEV-GOV-2026-001 remains PROPOSED. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`. This record does not claim compliance with Ghana’s Data Protection Act, 2012 (Act 843), Ghana Data Protection Commission guidance, the GDPR, NIST, OWASP ASVS, HL7 FHIR R4, or FHIR Bulk Data. Those sources were design references only. The 30-day figure and the 1000-record threshold are simulation values.

## What was built

Chart schema 36 adds privacy subjects, authorities, policies, requests, verifications, reviews, exports, export items, private artifacts, manifests, alerts, erasure plans, tombstones, and record versions. Requests move through verification and a separate approval before any artifact is created. A bulk request, and any request whose estimate is at least 1000 records, stays in elevated review until a second reviewer who is not the requester and not the first reviewer approves it. The worker claims a queued job, writes batches of 500, and resumes from the stored cursor. Artifacts and manifests stay in sqlite with a sha256 checksum. They are not public files and not an S3 delivery claim.

Policies `SYNTHETIC_GH_DSAR`, `SYNTHETIC_EU_DSAR`, and `SYNTHETIC_BULK_EXPORT` are `pending_policy_approval`. Email match does not verify a subject. A missing policy leaves the request in policy review. Research notes are never approved. Partial approval also drops third-party notes. Included third-party payloads are stored as `[redacted]`. Held rows are excluded. Erasure writes a plan hash, disposes only eligible synthetic rows, and reports a partial result when a held row remains. It does not delete the access ledger or change consent. Cleanup clears an expired payload unless a legal hold names that export, in which case the bytes stay and download stays off. The response says archive and backup copies were not verified.

Actors at Accra Central Medical Centre (`org_demo_gh` / `fac_gh_accra`): Adjoa Frimpong (`usr_gh_records`) submits and downloads, Kojo Asante (`usr_gh_privacy`) verifies, gives the first approval, and runs the worker, Yaw Owusu (`usr_gh_legal`) gives only the second bulk approval, Esi Boateng (`usr_gh_reviewer`) reads activity, and Yaa Asare (`usr_gh_reception`) is denied. Organization administrators were not given these permissions.

## Browser workflow

Adjoa submitted access request `dsr_grd823714b3c4594325` for `sub_minor_kofi` with authority `auth_guardian_ama`. It stayed `verification_pending`. Kojo verified it and approved categories `administrative-note,third-party-note,contact-preference`. Kojo generated `exp_exp63aec6ff27354c71`. The page showed monitoring `standard`, 3 records, manifest checksum `76a43a5e5bbee2b37dc401b5246f8097cce67f74a9022c439e789656d17dbe63`, and no download button for Kojo. Yaw opened the same export, saw no download button, posted the download route, and received `error=forbidden` with “This account cannot download the export.” Adjoa downloaded it. The page said “Download authorized for 3 records. The file stayed in private storage.”

Adjoa submitted wrong-guardian request `dsr_wrgb973afae4da040ac` with `auth_guardian_wrong`. Kojo’s verification returned `error=forbidden`. The page stayed `verification_pending` and said “Verification did not succeed. Protected data was not released.”

Adjoa submitted bulk request `dsr_blkec2d54742b414c03` for `sub_bulk_cohort`. Kojo’s first approval set `elevated_review` and dropped `research-note`. Yaw’s page offered “Give the second approval” and did not offer generation. After that approval the request was `approved`. Kojo generated `exp_expafec4fd5133042a3`. The page showed monitoring `large`, 4900 records, and checksum `260ec313d8efdf79f0f2b0cec2190dadf274e3e163680d1e1a2cf0646769e991`. The monitoring page showed `large-export-review` count 5000, `large-export-requested` count 5000, and `large-export-completed` count 4900. The item table was 4900 included, 50 `excluded-hold`, and 50 `excluded-policy`, which is 5000 rows. The outbox events `privacy.export.monitor` carried kind, export id, and count only.

Adjoa submitted erasure `dsr_ers3889f2390b324323`. Kojo verified, approved, and executed it. The page said “Erasure was partial. Held or protected records were not deleted. Backups outside this database were not verified.” `prv_minor_held` stayed `active`. The other minor rows were `disposed`.

Kojo revoked `auth_guardian_ama`. Adjoa’s export page removed the download button and said the authority was no longer active. A direct download post returned `error=forbidden`. The artifact expiry was then set to `2020-01-01T00:00:00.000Z` in sqlite. The next download post returned `error=conflict` and the page said the export was expired. Kojo’s cleanup recorded 1 artifact. That artifact’s access state is `cleaned` and its payload length is 0. The bulk artifact stayed `ready`. `auth_guardian_ama` was set back to `active` after those denials were observed.

Esi opened `/privacy/requests/activity` and saw the ledger lines, including denied downloads, with no generate or download control. Her direct download post returned `error=forbidden`. Yaa’s dashboard did not list Privacy requests. `/privacy/requests` said “Privacy requests are limited to authorized staff.” `/privacy/exports/exp_expafec4fd5133042a3` said “Exports are limited to authorized staff.” At a 390px viewport the same denial heading was present, `window.innerWidth` was 390, and the skip link was present. The session was signed out on the directory page.

A separate read of `data/curasphere.sqlite` showed schema 36. Akua Boateng’s consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` was still `withdrawn` at version 3. Legal hold `hold_hold293e3f3c90fc4b9a` was still `active`. One retention tombstone remained. The access ledger had 74 rows, including the privacy actions above.

## Commands

- `npm test --workspace @curasphere/domain`: 253 passed, 0 failed, exit 0. Duration about 58.6 seconds.
- `npm run typecheck --workspace @curasphere/domain` and `@curasphere/web`: exit 0.
- `npm audit --workspace @curasphere/domain` and `@curasphere/web`: 0 vulnerabilities, exit 0.
- `npm run build --workspace @curasphere/web`: exit 0. The route list included `/privacy/requests`, `/privacy/requests/new`, `/privacy/requests/directory`, `/privacy/requests/[id]`, `/privacy/requests/activity`, `/privacy/exports`, `/privacy/exports/[id]`, and `/privacy/exports/monitor`.
- `npm run governance:test`: 10 passed, 0 failed, exit 0.
- `npm run governance:local-experiment` in the local sandbox: exit 0. `permitted_feature=P03-F05`, `formal_phase02=IN_PROGRESS`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`. P02-R01 through P02-R06 remained PENDING. R-IMG-DEBIAN, R-CI, R-GOVERNANCE, and R-CLINICAL-DEFAULTS remained OPEN.

## Scenarios

`packages/domain/test/dsar.test.ts` passed 7 tests covering S01–S52: invalid type, email match, wrong subject before insert, guardian and forged or expired authority, cross-tenant and cross-facility denial, self-approval, partial scope, stale version, denied export, checksum, redaction, held exclusion, revoked authority, tampered checksum, expiry, bulk elevated review, 5000-row resume, worker-token claim, dependency outage, idempotent queue, cancellation, unexpected size, correction with prior version, unauthorized correction, partial erasure under a category hold, ledger seal, withdrawn consent, denied download audit, revoked session, production export refusal, and schema rollback to 35 then reopen at 36.

S32 used one database connection. A second worker token received `claimed: false`. Two operating-system processes were not launched. S53–S58 are the browser results above. No unexecuted scenario is marked passed.

## Residual limits

The artifact store is sqlite, not S3. Download does not return a public URL. Phase 04 clinical correction is not implemented; correction updates only the synthetic contact-preference row. Erasure does not prove that backups or archives outside this database were destroyed. The large-export threshold and the response deadline are engineering simulation values. Hosted CI was not run for this change. The 44 Debian high-severity findings remain open. Production and staging export delivery stay disabled.

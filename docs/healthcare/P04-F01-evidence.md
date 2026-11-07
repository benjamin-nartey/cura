# P04-F01 evidence — patient and practitioner master records

Experimental engineering evidence only. This file does not authorize Phase 04, change formal acceptance, or enable production or staging clinical processing.

Controlling scope: `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md`. Product Owner instruction: `docs/governance/P04-F01-PRODUCT-OWNER-AUTHORIZATION.md`. Architecture: `docs/adr/ADR-0066-patient-practitioner-master-records.md`. Operations: `docs/healthcare/P04-F01-runbook.md`.

## Source of truth

The chart SQLite `patients` table is the clinical master. Schema 38 adds preferred name, registration status, registration source, and merge pointer, plus identifier, contact, facility registration, version, duplicate candidate, merge, practitioner, affiliation, identity-link, and explicit subject-link tables.

Foundation Postgres patients are not updated by this feature. Harborlight remains 13 patients and Northwind remains 3. DEMO_GH and DEMO_EU fixture patients are separate. The consent subject `sub_akua_boateng` is not a patient row. The withdrawn consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` stayed withdrawn at version 3. The active hold `hold_hold293e3f3c90fc4b9a`, the released hold `hold_holdc926d2da614341be`, one retention tombstone, and the resolved privacy alert `alt_b1677a603f4e4ca2` at version 4 were still present after the browser session.

## What the browser did

On `http://localhost:3000` against the working chart database:

1. Kwame Boateng at Accra Central Medical Centre started a registration for a fictional Kofi Mensah born 1990-04-04. The review screen listed name-and-birth candidates and stated that nothing is merged from that screen.
2. Saving the registration created a separate active record, MRN ACC-1004, at `fac_gh_accra`, version 1, with no privacy-subject link.
3. Kwame opened the side-by-side comparison. The match reason was name-birth. Merge controls were absent. The page said merge is limited to an organization administrator who did not open the candidate.
4. Ama Mensah compared the same candidate, selected `pat_gh_kofi_a` as the surviving record, confirmed, and the backend stored the merge. The new record became `merged` version 2 and still carries identifier ACC-1004. `pat_gh_kofi_a` stayed active.
5. Ama created practitioner Efua Darko, affiliated with `fac_gh_accra`, with fictional license SYN-LIC-7781 and verification state `fictional-unverified`. Linking the revoked workforce identity was refused. Linking `usr_gh_doctor` was stored and the page stated that the link does not change access.
6. Marta Keller’s session opened the Ghana patient URL and received “That record is not on this facility.” Her directory showed the Northbridge patient with the same local MRN value, not the Ghana rows.
7. Yaa Asare’s session opening `/patients` was sent to the access-denied page.
8. At a 390px width the denied page had no horizontal overflow (`scrollWidth` 390). Skip link and labelled fields are present. An automated accessibility scanner was not run.

The local chart was schema 37 before the first request and schema 38 after the additive migration.

## Automated checks

Domain typecheck and web typecheck exited 0.

`npm test --workspace @curasphere/domain` exited 0: 264 tests, 264 passed, 0 failed.

`npm run governance:test` exited 0 after acceptance: 10 tests, 10 passed, 0 failed. The sandbox permitted feature is `none`. Staging and production cases in that file still refuse the override. The local runner exited 0 with `permitted_feature=none`, Phase 02 `IN_PROGRESS`, formal Phase 03 `NOT_AUTHORIZED`, the exception `PROPOSED`, and `amendment_hash_matches=true`. P02-R01 through P02-R06 stayed `PENDING`. `R-IMG-DEBIAN` and `R-CI` stayed `OPEN`.

`npm audit` for `@curasphere/domain` and `@curasphere/web` exited 0. The 44 Debian high-severity findings and the unverified hosted CI status are unchanged and were not rescanned.

`npm run build --workspace @curasphere/web` exited 0.

## Not done

P04-F02 is not started. Formal Phase 04 stays not started. Phase 02 stays in progress. Formal Phase 03 stays not authorized. DEV-GOV-2026-001 stays proposed. P02-R01 through P02-R06 stay pending. No AI dependency was added. Clinical child rows are not moved by a merge.

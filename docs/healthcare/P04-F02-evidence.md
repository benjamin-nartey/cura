# P04-F02 evidence — appointments and encounter lifecycle

Experimental engineering evidence only. This file does not authorize Phase 04, change formal acceptance, or enable production or staging clinical processing.

Controlling scope: `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md`. Product Owner instruction: `docs/governance/P04-F02-PRODUCT-OWNER-AUTHORIZATION.md`. Architecture: `docs/adr/ADR-0067-appointments-and-encounters.md`. Behavior: `docs/healthcare/appointments-and-encounters.md`. Operations: `docs/healthcare/P04-F02-runbook.md`.

## Decision

P04-F02 is `EXPERIMENTAL_ENGINEERING_COMPLETE` in `docs/governance/experimental-engineering-register.json` only. Formal status stays `NOT_STARTED`.

## Source of truth

Chart SQLite schema 39 extends the existing `appointments` table and adds scheduling resources, practitioner availability, scheduling reservations, appointment events, visit encounters, visit encounter events, schedule commands, scheduling notices, scheduling metrics, and scheduling controls. The older chart `encounters` table is unchanged and is not the visit lifecycle. Legacy rows stay `source=legacy-chart` and are not exclusive reservations.

Intervals are half-open `[start, end)`. Exclusive practitioner capacity is 1. SQLite has no exclusion constraint, so overlap is checked inside `BEGIN IMMEDIATE` with `busy_timeout` 5000. A closed appointment keeps its reservation active. Cancellation and no-show release the reservation. Walk-in encounter creation is not implemented.

Organization and facility come from the session. The booking functions do not accept a client organization id.

## Preserved rows after the browser session

Read-only query of `data/curasphere.sqlite` after the browser journey:

- Schema version 39.
- Harborlight 13 patients, Northwind 3, DEMO_GH 4, DEMO_EU 1.
- `pat_gh_kofi_a` remains active. Merged registration `f6744983-b946-4e9b-8de2-7981db9c4388` remains `merged` into `pat_gh_kofi_a`. `pat_gh_kofi_b` remains active.
- Consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` remains withdrawn at version 3.
- Hold `hold_hold293e3f3c90fc4b9a` remains active. Hold `hold_holdc926d2da614341be` remains released. Retention tombstones: 1.
- Privacy alert `alt_b1677a603f4e4ca2` still has event history ending in `resolved`.
- `usr_gh_doctor` remains linked to practitioner `pr_b1c3815489d9422c`, not `pr_gh_kwame`.

## Browser journey

On `http://localhost:3000` against the working chart database:

1. Akosua Owusu (`usr_gh_nurse`) requested Kofi Mensah (`pat_gh_kofi_a`) with Kwame Boateng (`pr_gh_kwame`) at `2026-10-20T09:00:00.000Z`. Appointment `apt_ffa1b67e6b514e1e` was saved as `requested` version 1. She confirmed it to version 2.
2. Adwoa Sarpong (`usr_gh_transfer`) did not see 09:00 as an open time. A direct post of that start returned the slot conflict and kept the same practitioner.
3. Akosua recorded arrival from check-in. The page stated that the encounter had not started.
4. Kwame Boateng (`usr_gh_doctor`) started visit encounter `enc_231f2f1bce914970` and then closed it. The encounter is `completed` version 2. The appointment is `closed` version 5. Its reservation stays `active` at 09:00.
5. Ama Mensah (`usr_gh_admin`) opened that encounter URL and was sent to `/access/denied`.
6. Akosua requested a second appointment, `apt_f1a2b771c4b84c96`, at 10:00, rescheduled it to `2026-10-20T10:20:00.000Z` (version 2), and cancelled it with reason `patient-request` (version 3). The calendar then showed 10:20 as cancelled and 11 open follow-up times. The reservation is `released`.
7. The calendar for Sunday 2026-10-25 showed “No saved appointment” and “No open follow-up time.” The appointments list with an unmatched search and `error=stale` showed the stale-data alert and “No appointment matches this facility view.” Loading copy was shown while those pages rendered.

axe-core 4.10.3 `axe.run` on the closed encounter page returned no violations at client width 503 and, after `Emulation.setDeviceMetricsOverride` to 390×844, no violations with `scrollWidth` 390. Device metrics were cleared afterward. An earlier scan found contrast and duplicate-banner issues; those were fixed before the clean scan. The product notice is a named region.

## Automated checks executed for this feature

`npm test --workspace @curasphere/domain` exited 0: 309 tests, 309 passed, 0 failed, duration 86732 ms. That run includes `packages/domain/test/scheduling.test.ts` scenarios P04-F02-S01 through S44, including the cross-process races S14/S44, S27, and S40. The prior 264-test baseline is not this result.

`npm run typecheck` exited 0 for contracts, domain, fhir, and web.

`npm audit --workspace @curasphere/domain` and `npm audit --workspace @curasphere/web` each exited 0. The 44 Debian high findings were not rescanned and are not treated as resolved. Hosted CI was not observed.

`npm run build --workspace @curasphere/web` exited 0.

`npm run governance:test` exited 0: 10 tests, 10 passed. While P04-F02 was still `NOT_STARTED`, the local runner exited 0 with `permitted_feature=P04-F02`. After this acceptance, the same command exited 0 and the runner printed `permitted_feature=none`, `formal_phase02=IN_PROGRESS`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`, P02-R01 through P02-R06 `PENDING`, and `R-IMG-DEBIAN=OPEN`, `R-CI=OPEN`. Staging, production, clinical emergency, and production-data cases in that test still refuse the override.

Foundation Gradle and the AI gateway were not changed and were not re-run.

## Not done

P04-F03, clinical source entries, is not started. Formal Phase 04 stays not started. Phase 02 stays in progress. Formal Phase 03 stays not authorized. DEV-GOV-2026-001 stays proposed. No AI dependency was added. No FHIR conformance claim is made.

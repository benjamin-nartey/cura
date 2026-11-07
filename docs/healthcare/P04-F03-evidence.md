# P04-F03 evidence — clinical source entries

Experimental engineering evidence only. This file does not authorize Phase 04, change formal acceptance, enable production or staging clinical processing, or claim a prescription, diagnosis, or FHIR conformance result.

Controlling scope: `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md`. Product Owner instruction: `docs/governance/P04-F03-PRODUCT-OWNER-AUTHORIZATION.md`. Architecture: `docs/adr/ADR-0068-clinical-source-entries.md`. Behavior: `docs/healthcare/clinical-source-entries.md`. Operations: `docs/healthcare/P04-F03-runbook.md`.

## Decision

P04-F03 is `EXPERIMENTAL_ENGINEERING_COMPLETE` in `docs/governance/experimental-engineering-register.json` only. Formal status stays `NOT_STARTED`.

## Source of truth

Chart SQLite schema 40 adds versioned source tables for conditions, allergies, observations, observation components, and medication-order drafts. Each mutation inserts an immutable `source_versions` row. The older chart tables `conditions`, `allergies`, `observations`, `medications`, and chart `encounters` are unchanged. Visit encounters from P04-F02 remain the encounter reference.

Terminology is a local synthetic catalog, version `2026.10`. It is not a SNOMED CT, LOINC, ICD, or UCUM conformance claim. Units are catalog codes such as `Cel`, `mm[Hg]`, `/min`, `%`, `kg`, `cm`, and `mg`. There is no silent unit conversion.

Medication orders are drafts. `executable` is constrained to 0 and `transmission` to `disabled`. `clinical.sign`, pharmacy transmission, dispensing, and administration stay denied. The screen says “Synthetic draft — not a valid prescription.”

## Preserved rows after the browser session

Read-only query of `data/curasphere.sqlite` after the browser journey:

- Schema version 40.
- Harborlight 13 patients, Northwind 3, DEMO_GH 4, DEMO_EU 1.
- `pat_gh_kofi_a` remains active. Merged registration `f6744983-b946-4e9b-8de2-7981db9c4388` remains `merged` into `pat_gh_kofi_a`. `pat_gh_kofi_b` remains active.
- Consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` remains withdrawn at version 3.
- Hold `hold_hold293e3f3c90fc4b9a` remains active. Hold `hold_holdc926d2da614341be` remains released. Retention tombstones: 1.
- Privacy alert `alt_b1677a603f4e4ca2` still has event history ending in `resolved`.
- `usr_gh_doctor` remains linked to practitioner `pr_b1c3815489d9422c`, not `pr_gh_kwame`.
- Appointment `apt_ffa1b67e6b514e1e` remains closed version 5 at `2026-10-20T09:00:00.000Z` with an active reservation. Visit `enc_231f2f1bce914970` remains completed version 2. Appointment `apt_f1a2b771c4b84c96` remains cancelled version 3 with a released reservation.
- Retention policy `pol_syn_gh_source` is category `clinical-source`, action `retain`, approval `pending_policy_approval`.

## Browser journey

On `http://localhost:3000` against the working chart database:

1. Akosua Owusu (`usr_gh_nurse`) requested Kofi Mensah (`pat_gh_kofi_a`) with Kwame Boateng (`pr_gh_kwame`) at `2026-10-21T09:00:00.000Z`. Appointment `apt_866fa562b0a64aca` was saved, confirmed, and marked arrived. Arrival did not start the encounter.
2. Kwame Boateng (`usr_gh_doctor`) started visit encounter `enc_2d8798a5b9ab48c9`.
3. S53: he recorded condition `cnd_f1eb24802a7044c3`, code `syn-follow-up`, clinical status `active`, verification `unconfirmed`, version 1.
4. S54: he recorded allergy `alg_40c67c0e3d7b45ff` as `syn-unknown` / finding `unknown`, and allergy `alg_98f3b03f24014b2c` as documented penicillin with criticality `low`. The overview states that unknown status is not no known allergies.
5. S55: temperature `obs_3e9e362e96ae4fdf` was saved as 38.1 `Cel`, effective `2026-10-21T09:05:00.000Z`, recorded `2026-10-15T12:47:23.795Z` by `usr_gh_doctor`. Blood pressure `obs_1274edd0a2674e62` stored systolic 128 and diastolic 82 `mm[Hg]`.
6. S57: medication draft `med_010d02f88d254db6` is paracetamol 500 mg, status `draft`, version 1, executable 0, transmission `disabled`. The page shows “Synthetic draft — not a valid prescription.” There is no sign or transmit control.
7. S56: the temperature correction stored version 2 at 37.1 `Cel`, status `corrected`, reason `entry-error`, prior version 1. The version-1 snapshot still holds 38.1 `final`. History on screen lists both versions and the same author.
8. S60: a second correction posted with expected version 1 returned `/clinical/observations/obs_3e9e362e96ae4fdf/correct?error=source-stale`. The page says “This clinical entry changed. Review the current version before trying again.” The current row stayed version 2 at 37.1.
9. Kwame closed `enc_2d8798a5b9ab48c9`. It is `completed` version 2. The appointment is `closed` version 5 and its reservation stays `active`.
10. S59: the completed encounter overview hides ordinary add links and says ordinary recording is closed. A new condition post with a different body returned `error=source-closed`. The correction form for the existing observation remains available. Replaying the original condition idempotency key returned the stored success and did not create a second condition.
11. S58: Ama Mensah (`usr_gh_admin`) and Yaa Asare (`usr_gh_reception`) were sent to `/access/denied` for the clinical source URLs. The denial page did not show the observation values.

axe-core 4.10.3 `axe.run` on the correction page first reported contrast failures on `.form-error` and `.btn-dark`. `--primary` is now `#c2410c` and `--danger` is now `#9f1239`. The rerun returned no violations at the desktop width. After `Emulation.setDeviceMetricsOverride` to 390×844, `scrollWidth` was 390 and `axe.run` returned no violations. Device metrics were cleared afterward.

## Automated checks executed for this feature

`npm test --workspace @curasphere/domain` exited 0: 356 tests, 356 passed, 0 failed, duration 185600.9276 ms. That run includes `packages/domain/test/clinical-source.test.ts` scenarios P04-F03-S01 through S52, including the cross-process stale correction S20/S50. The prior 309-test baseline is not this result.

`npx tsc --noEmit -p apps/web` exited 0 after the observation and medication read types were widened. An earlier full `npm run typecheck` had already passed contracts, domain, and fhir, and had failed web before that type fix. The later contrast token change is CSS only.

`npm audit --workspace @curasphere/domain` and `npm audit --workspace @curasphere/web` each exited 0 with 0 vulnerabilities. The 44 Debian high findings were not rescanned and are not treated as resolved. Hosted CI was not observed.

`npm run build --workspace @curasphere/web` exited 0.

`npm run governance:test` exited 0 with 10 passed while P04-F03 was still `NOT_STARTED`, and the local runner printed `permitted_feature=P04-F03`. After this acceptance, the same test exited 0 with 10 passed, and the runner exited 0 with `permitted_feature=none`, `formal_phase02=IN_PROGRESS`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`, P02-R01 through P02-R06 `PENDING`, and `R-IMG-DEBIAN=OPEN`, `R-CI=OPEN`, `R-GOVERNANCE=OPEN`, `R-CLINICAL-DEFAULTS=OPEN`. Staging and production configurations in that test still refuse the override.

Foundation Gradle and the AI gateway were not changed and were not re-run. No AI service is called by the source-entry module.

## Not done

P04-F04, orders, care plans, and referrals, is the next roadmap feature and is not started. Formal Phase 04 stays not started. Phase 02 stays in progress. Formal Phase 03 stays not authorized. DEV-GOV-2026-001 stays proposed. P02-R01 through P02-R06 stay pending. `R-IMG-DEBIAN`, `R-CI`, `R-GOVERNANCE`, and `R-CLINICAL-DEFAULTS` stay open.

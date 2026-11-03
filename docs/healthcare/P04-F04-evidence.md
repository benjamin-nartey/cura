# P04-F04 evidence — orders, care plans, and referrals

Experimental engineering evidence only. This file does not authorize Phase 04, change formal acceptance, enable production or staging clinical processing, or claim that a request was transmitted, resulted, or dispensed.

Controlling scope: `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md`. Product Owner instruction: `docs/governance/P04-F04-PRODUCT-OWNER-AUTHORIZATION.md`. Architecture: `docs/adr/ADR-0069-orders-care-plans-referrals.md`. Behavior: `docs/healthcare/orders-care-plans-referrals.md`. Operations: `docs/healthcare/P04-F04-runbook.md`.

## Decision

P04-F04 is `EXPERIMENTAL_ENGINEERING_COMPLETE` in `docs/governance/experimental-engineering-register.json` only. Formal status stays `NOT_STARTED`.

## Source of truth

Chart SQLite schema 41 adds `work_orders`, `work_plans`, `work_referrals`, `work_tasks`, `work_attachments`, `work_versions`, and `work_commands`. A saved request has `fulfillment = not-transmitted`. Routing updates the local status. It does not call a laboratory, imaging service, or pharmacy. The older `lab_orders`, `rx_orders`, `care_plans`, `care_referrals`, and `care_tasks` tables were not reused. Medication drafts from P04-F03 stay non-executable.

## Commands and results

- `npx tsc --noEmit -p packages/domain` — exit 0.
- `npx tsc --noEmit -p apps/web` — exit 0.
- `npm test --workspace @curasphere/domain` — exit 0, 373 tests, 373 passed, 0 failed, `duration_ms` 120432.4562. This includes `packages/domain/test/work.test.ts`. An earlier run failed 9 identity tests with `fetch failed` while Dex on port 15556 was down. After `docker compose -f infra/local/compose.yaml up -d dex`, the suite above passed.
- `npm audit --workspace @curasphere/domain` — exit 0, found 0 vulnerabilities.
- `npm audit --workspace @curasphere/web` — exit 0, found 0 vulnerabilities.
- `npm run build --workspace @curasphere/web` — exit 0.
- `npm run governance:test` with the experimental override unset — exit 0, 10 tests, 10 passed, while the register still said P04-F04 was not complete. The test expected `permittedFeature` `P04-F04`.
- `node tools/governance/local-experiment.mjs` with the local sandbox variables set and `EXPERIMENT_STATUS_PATH` unset — exit 0, `permitted_feature=P04-F04`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`, P02-R01 through P02-R06 `PENDING`, and R-IMG-DEBIAN, R-CI, R-GOVERNANCE, and R-CLINICAL-DEFAULTS `OPEN`.

After the experimental register was marked complete, `npm run governance:test` passed 10 of 10 with the override unset, and the local runner printed `permitted_feature=none`. Formal Phase 03 stayed `NOT_AUTHORIZED`, the exception stayed `PROPOSED`, and the amendment hash still matched.

## Browser journey

Chrome, driven against `http://127.0.0.1:3000`:

1. Akosua Owusu (`usr_gh_nurse`) booked Kofi Mensah (`pat_gh_kofi_a`) with Kwame Boateng (`pr_gh_kwame`) for follow-up at `2026-10-23T09:00:00.000Z`. Appointment `apt_d7079e7efb3c4051` was confirmed and marked arrived.
2. Kwame Boateng (`usr_gh_doctor`) started visit `enc_e497bb26b5d5451f`. The completed visit `enc_2d8798a5b9ab48c9` was not reused.
3. Two identical submissions of the full blood count request returned the same URL, `ord_c8d393a33ece4d0d`. The chart has one `work_orders` row for that id. Version 1 remains `submitted`. Version 2 is `routed`. `fulfillment` is `not-transmitted`.
4. The order screen says “Not a transmitted order.” An attachment reference `att_3507832fcf284737` stores the synthetic note metadata only.
5. Care plan `cpl_aef7c90f41b942c0` was saved active, version 1, owned by `usr_gh_doctor`.
6. Referral `ref_98790a17a8594e3b` was saved to Madina and later accepted at version 2.
7. The Accra pending list showed the blood count request, the follow-up plan, and the diagnostic review.
8. A separate nursing request, `ord_66e4d89928894183`, was cancelled. Its submitted version remains.
9. Opening a new request against completed encounter `enc_2d8798a5b9ab48c9` redirected to `/work?patient=pat_gh_kofi_a&encounter=enc_2d8798a5b9ab48c9&error=source-closed`.
10. Kojo Mensah (`usr_gh_lab`) at Madina saw the blood count request and the diagnostic review, assigned task `tsk_ce01261564344f31` to himself, and marked the request routed. The notice says nothing was sent outside this system.
11. Order history shows version 1 recorded by `usr_gh_doctor` and version 2 routed. Cancelling with expected version 1 after the route returned `error=source-stale`. The routed request stayed visible to the doctor.
12. Ama Mensah (`usr_gh_admin`) and Yaa Asare (`usr_gh_reception`) were sent to “This area is not available.”
13. axe-core 4.10.3 on the order screen reported no violations at 1280px. At 390×844, after the heading was present, it reported no violations, `scrollWidth` 390 and `clientWidth` 390. An earlier sample ran during the loading shell and is not the result.
14. The session was signed out. The sign-in directory was visible again.

## Preserved rows after the browser session

Read-only query of `data/curasphere.sqlite`:

- Schema version 41.
- Harborlight organization 13 patients, Northwind 3, DEMO_GH 4, DEMO_EU 1.
- `pat_gh_kofi_a` and `pat_gh_kofi_b` remain active.
- Consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` remains withdrawn at version 3.
- Hold `hold_hold293e3f3c90fc4b9a` remains active. Hold `hold_holdc926d2da614341be` remains released. Retention tombstones: 1.
- `usr_gh_doctor` remains linked to practitioner `pr_b1c3815489d9422c`.
- Appointment `apt_866fa562b0a64aca` remains closed version 5. Visit `enc_2d8798a5b9ab48c9` remains completed version 2. Visit `enc_231f2f1bce914970` remains completed version 2. Appointment `apt_ffa1b67e6b514e1e` remains closed version 5. Appointment `apt_f1a2b771c4b84c96` remains cancelled version 3.
- Observation `obs_3e9e362e96ae4fdf` remains corrected, value 37.1, version 2. Medication draft `med_010d02f88d254db6` remains executable 0 and transmission `disabled`.
- Retention policies `pol_syn_gh_source` and `pol_syn_gh_work` remain `retain` with approval `pending_policy_approval`.
- Legacy laboratory rows `ord_294c8596-28e0-4d56-88a6-acf3b199c0e4` and `ord_682470e7-5c71-49d5-baa5-7ec48ebe0391` are not the new coordination ids.

## Not claimed

Hosted CI was not rerun. The Debian image highs in R-IMG-DEBIAN were not rescanned. Foundation Gradle and the AI gateway were not rerun. This result is not clinical validation, certification, or production authorization.

Next experimental feature, not started: P04-F05 — Billing Primitives and Chart UX.

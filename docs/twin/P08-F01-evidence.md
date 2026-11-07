# P08-F01 — Derived schema and provenance evidence

Local synthetic engineering verified 2026-11-05 on experimental/phase-03-local. Formal Phase 08 remains NOT_STARTED. Qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending; production clinical functionality remains disabled. P08-F02 has not started.

## Delivered behavior

Schema 54 adds immutable, owner/context-bound twin_evidence_manifests and twin_evidence_members. Each assertion pins its exact clinical/work ledger, logical record, source version, raw-snapshot SHA and recording time. Clinical/work foreign keys, exclusive ledger selection, unique members, count/digest checks and immutable-row triggers protect membership. Clinical snapshot values are not copied into these tables. Captures are transactional, bounded and idempotent; actor/patient capture versions serialize across real competing SQLite processes.

The source inventory reuses actual clinical source-history and work-service readers. Clinical conditions, allergy assessments, medication drafts and observations remain distinct source assertions; work orders/plans/referrals retain recorded statuses. No active/recent/pending interpretation, care-gap inference, diagnostic risk calculation or clinical write is introduced. Unperformed risk evaluation is policy metadata with no patient signals. The legacy PatientState builder/API remains unchanged and separate.

Work evidence requires both kind-read and work-history permission, including a source-owned availability/authority probe when the portfolio is empty. Historical work must remain in the selected patient's authorized portfolio; a forged derived digest cannot authorize another patient's source. Referral versions recorded at the destination remain inspectable by an authorized originating clinician through actual service history rights. Every read/capture/inspection reauthorizes live patient/context/source permissions and emits IDs-only audit.

GET/POST /api/patient-twin provide strict no-store source-evidence read/capture and exact-member inspection. Same-origin, bounded UTF-8 body/query, owner/tenant/facility/purpose/coverage and live-session checks apply. Source or integrity failure never becomes successful empty evidence. Stale captures withhold facts; exact old source remains separately reauthorized and explicitly historical.

The chart's Patient Twin page uses the real API for capture/refresh, source categories/statuses/provenance and structured exact evidence with optional JSON. It supports source-change withholding, historical evidence, loading/error/empty/cancel, keyboard focus restoration, phone layout and offline/restored-page redaction without queued capture replay. Captured time/status are explicitly the last read, not a live-feed guarantee. Native advanced Twin UI belongs to the later UX feature; existing mobile workflows are preserved.

Implementation paths: `packages/domain/src/twin-evidence.ts`, `twin-evidence-schema.ts`, schema migration in `db.ts`, source-owned probe in `work.ts`, `apps/web/app/api/patient-twin/route.ts`, `apps/web/components/twin-evidence.tsx`, `/patients/[id]/twin/page.tsx` and the unified chart link. Disposable rollback chaining and latest-schema test expectations were updated without weakening older migration-boundary assertions.

## Executed checks

Artifacts are under artifacts/governance-v2/.

| Check | Observed result |
| --- | --- |
| Full domain npm test | 560 pass, zero failures — P08-F01-domain-verified.log |
| npm run twin:evidence:test | 15 pass, overlapping the full suite — P08-F01-focused-final.log; exact clinical/work pins, corrections, work status changes, independent history rights, referral destination versions, forged cross-patient membership, unavailable empty work portfolio, quota, corrupt/missing evidence, failed insertion/migration and competing processes |
| Live canonical/frontend/Twin browser suite | 12 distinct cases pass — P08-F01-browser-final.log, .json |
| Final Twin browser rerun after the last guards | Four repeated cases pass on the final build — P08-F01-twin-verified.log, .json; actual Foundation sessions, chart link, capture, exact work/clinical inspection, actual observation correction 37.1 to 37.6, historical value, stale withholding, idempotency, wrong scope/owner/role/origin, unverified payload denial, offline/reconnect and captured-empty state |
| Actual Metro mobile/browser/API | Four pass — P08-F01-mobile-final.log; separately archived shared evidence |
| Types | Workspace contracts/domain/FHIR/web and mobile pass — P08-F01-types-final.log, P08-F01-mobile-types.log; final domain source/test check passes — P08-F01-domain-types-verified.log |
| Lint/build | Final scoped lint and optimized build pass — P08-F01-lint-verified.log and P08-F01-build-verified.log |
| Governance | 16 v2 + ten local/review pass — P08-F01-governance-final.log, P08-F01-governance-local-final.log |
| Conformance | Eight pass — P08-F01-conformance.log |
| Source/derived recovery | Existing shipped live-Foundation worker processes only newly queued synthetic versions and restores source-matched current projection; actual materialized source inspection and focus restoration pass — P08-F01-worker-smoke.json, worker-final.json and worker-verified.json (10 + 2 + 2 new versions processed; final projection 164 events) |
| Original-row preservation | Schema 53 to 54; original primary keys/column values across 33 source/provenance/integration/SMART/batch/appointment/projection/snapshot tables remain unchanged — P08-F01-preservation.json, .py |

The browser creates new synthetic observations and corrects only those new records. Existing clinical/work rows are not altered by Twin. The structured BP, medication draft, allergy/condition, plan/referral/order source cases use actual source commands in disposable databases. The captured evidence is inspectable and raw hashes match source snapshots; there are no hardcoded runtime success responses.

Screens P08-F01/twin-desktop.png and twin-phone.png were visually inspected; Axe and 390-pixel containment pass. The consistent pre-feature snapshot is P08-F01-before.sqlite. Prior shared timeline/mobile evidence is restored with this run archived separately; both Next-generated files match captured starting SHA-256 values after checks. New synthetic rows, capture membership and processing receipts remain; no clinical cleanup deletion was performed.

## Findings and repaired cases

Review identified independent work-history authorization, destination-recorded referral versions, damaged derived membership crossing patient context, and unavailable-but-empty work portfolios. These now follow source-owned access checks and explicit patient binding, with actual regressions. A damaged self-consistent manifest cannot promote another patient's work into the view. An unavailable work service cannot produce successful empty capture/read.

Initial fixture failures used an unsupported cancellation reason and a wrong directory property; the tests now use actual source contract values. No runtime guard was weakened. The initial broad suite had one OIDC provider-restart timeout during concurrent build load; sequential final execution passes all 560 cases. Logs remain intact.

The initial browser run recorded a multi-hour wall-clock gap and an existing timeline login timeout, plus a new test selector ambiguity between the Twin alert and Next's route announcer. The test now scopes its assertion to the Twin panel; the full rerun and final Twin rerun pass. Source rejection was already occurring correctly. Initial mobile browser evidence recorded an Expo icon-font loader timeout despite a successful but slow local font response; the warmed-asset rerun passes the same four checks without weakening error assertions or changing mobile code. Failed logs/traces remain alongside final evidence.

## Scope and release boundary

[Plan](P08-F01-plan.md), [ADR-0081](../adr/ADR-0081-versioned-twin-evidence-manifests.md), [architecture/API/runbook](P08-F01-architecture-and-operations.md), [risk controls](P08-F01-risks.md), [scenarios](P08-F01-scenarios.json), [local continuation authority](P08-LOCAL-SIMULATION-AUTHORITY-2026-11-04.md).

This completes the bounded source-representation feature. Active-state projection, clinical conflict logic, automated age/refresh/rebuild operations and advanced clinician/native UX remain P08-F02 through F05. Mutable tasks and unsupported source families are not fabricated into versioned assertions. The prior Phase 07 combined mixed-workflow rehearsal remains explicitly unclaimed. Capacity/retention/subject-rights and clinical deployment decisions require qualified review.

No new official FHIR validator execution is claimed: R4 serialization is unchanged, previous eleven-case Phase 06 official evidence remains intact and current conformance checks pass. Remote CI has not run these uncommitted changes. No commit, push, merge, publication, deployment or production activation occurred.

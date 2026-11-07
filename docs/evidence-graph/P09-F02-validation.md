# P09-F02 engineering validation â€” 6 November 2026

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Local synthetic engineering only. Formal Phase 09 remains NOT_STARTED; qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending. Production clinical functionality remains disabled.

## Implemented scope
Schema 59 adds immutable owner-scoped synthetic document imports, annotated edges to exact claim revisions and scoped idempotent receipts. The real API/UI links current timeline versions, existing server-mapped FHIR R4 resources and imported plain-text documents using supported/contradicting/insufficient annotations. Exact inspection includes source record, version, checksum and separate effective/recorded times. An unknown effective time stays unknown. No remote fetch, model/provider or authoritative clinical mutation is introduced; every claim remains unverified.

## Executed checks
- Full domain suite: 643 passed, zero failed (`domain-full.log`), including the 11 initial ingestion cases and all existing 632 tests.
- Final focused ingestion suite: 13 passed, zero failed (`domain-focused-final.log`), adding actual two-process idempotency and corrupted-edge rejection. Covers persisted semantics, exact FHIR/clinical/document provenance, missing dates, strict input, actor/tenant/facility/purpose/permission boundaries, actual source correction, claim revisions, outages, atomic outbox failure and actual migration failure/reopen/retry.
- Root typecheck and lint passed. Optimized corrected Next build passed (`types-final.log`, `lint-verified.log`, `build-fixed.log`). Final E2E source lint passed (`e2e-lint-final.log`).
- Governance engine: 16 passed (`governance.log`).
- Initial browser run found an ambiguous selector label and unfinished delayed test callback; retained failure evidence, added explicit accessible selector labels and deterministic response/cancel completion. API isolation and offline clearing passed in that run. A first build command lacked the required local directory setting; the sandbox rejected it and the correctly configured build passed.

Artifacts: artifacts/governance-v2/P09-F02. Final live regression, worker and preservation evidence is appended after execution. The source/edge service code was unchanged after the passing domain run; final UI changes added explicit selector names and keyboard focus to the scrollable JSON panel.

## Remaining release restrictions
No clinical validation, qualified approval, compliance certification or formal acceptance is claimed. Imported documents are derived owner-provided evidence and are not newly included in external FHIR/DSAR exports. Qualified privacy/retention/export classification is required before real-data use. F03â€“F05 remain NOT_STARTED. No commit, push, merge, publication or deployment is authorized.

## Stronger phone check
The initial eight combined browser cases passed. Screenshot review showed a phone capture during the scheduled source refresh, so a stronger check explicitly reopens evidence on the phone. This revealed the scrollable JSON region lacked keyboard focus. The panel now has an explicit accessible name and tabindex; a final test verifies focus, source content and accessibility together. Initial failures remain retained in phone-before-failures.

## Final executed closeout
- Eight combined P09-F01/P09-F02 browser tests passed (`e2e-final.json`). After the JSON-panel focus fix, all three strengthened ingestion tests passed on the final build (`ingestion-final.json`), including exact evidence and private draft clearing on offline/cancel/late responses. All four mobile workspace regressions passed (`mobile-final.log`); fresh shared JSON/screens are archived under `regression-evidence/mobile-workspace`.
- The extra screenshot-only frozen-clock experiment timed out inside Axe, whose timers were paused. That harness change was reverted; it is not a product failure. A short unfrozen live-service visual smoke then verified an existing exact document record and keyboard focus at 390px and 1280px, and captured the populated pages (`visual-smoke.json`, `sources-phone.png`, `sources-desktop.png`). No passing check is inferred from the failed frozen-clock experiment.
- Final optimized build including the focus fix passed (`build-final-verified.log`); final selected UI/test lint passed (`final-ui-lint.log`). Original generated Next configuration bytes were restored.
- Actual Foundation-backed timeline worker processed two new items; 241 events have matching current source hashes. Twin materialization 48 and background/empty-source verification are current. Exact clinician evidence matched, modal Escape restored focus, and no clinical resolution was recorded (`end-state-worker-smoke.json`).
- Consistent before/after comparison: schema 58 → 59, all original keys and values preserved across 47 checked source/immutable tables, zero missing or changed originals (`preservation.json`). New synthetic records and immutable history remain retained.
- 220 prior proof files were checked by hash; seven modified shared files were archived and restored to their previous bytes (`prior-evidence-restored.json`). Active logs were not truncated. A fresh bounded local Twin watcher was restored using current owner/patient authority.

P09-F02 is engineering-verified with qualified reviews pending. No unresolved in-scope functional defect was observed in the executed checks. This is synthetic software behavior evidence, not clinical validation or formal acceptance. F03–F05 remain NOT_STARTED. Local web serves the final optimized build on port 3000; Metro remains on 8082. No commit, push, merge, publication or deployment was performed.

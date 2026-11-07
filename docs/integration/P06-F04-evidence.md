# P06-F04 — completed local engineering verification

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Formal Phase 06 remains NOT_STARTED. Production clinical functions remain disabled; automated tests are not qualified clinical/privacy/architecture/licensing approval. See [plan](P06-F04-plan.md), [runbook/API](P06-F04-architecture-and-operations.md), [risk controls](P06-F04-risks.md) and [ADR-0074](../adr/ADR-0074-resumable-reviewed-integration-batches.md).

## Implemented scope

Schema 50 → 51 adds immutable import/export manifests, per-item outcomes, durable page runs and audited recovery history, plus outbox recovery counters. Signed import manifests retain exact individual bytes; transport receipt does not write clinical data. Eligible clinicians claim and review bounded pages through the real source services. Source/history/outbox/item/cursor share one transaction. Page leases, command hashes and immutable run boundaries support crash/restart and concurrent processing without repeating source events.

Export captures authorized Observation IDs/versions and queues actual F03 snapshots in reviewed pages. Changed source versions become explicit conflicts. Completion means every selected item has an outcome; it never asserts successful remote delivery. Quarantine reconciliation preserves original bytes and histories. Delivery redrive retains stable ID/body, original attempt history, current authority and a three-generation cap.

The role-scoped reconciliation UI provides queue/filter pagination, mapped identity/value inspection, attestation, cursor resume, cancellation, partial reports, quarantine recovery and delivery redrive. It uses the existing workspace typography, responsive controls and table containment. Disabled connections retain readable historical batch progress while sensitive previews and processing stay blocked. This is a workforce web workflow; native/mobile batch administration is N/A, with existing mobile functionality regressed.

## Executed verification

Artifacts below are under `artifacts/governance-v2/`. Failed initial diagnostics are retained and excluded from pass counts.

| Actual check | Observed result / artifact |
|---|---|
| `npm test` | 490 pass, zero failures: 475 prior + 15 new bulk/reconciliation scenarios — `P06-F04-domain.log` |
| `npm run batches:test` after historical-report safeguard | All 15 pass — `P06-F04-focused-final.log` |
| `npm run integrations:test` | 20 pass, covering existing signed transport, source scope and actual shipped receiver restart — `P06-F04-transport-regression.log` |
| `npx playwright test tools/e2e/p06-f04.spec.ts` against port 3000 | All three pass on the final build — `P06-F04-browser-complete.log/json`; actual signed sender, persisted clinical writes, partial recovery, reload/resume and export queueing |
| Source/SMART/partner/landing/login/workspace browser regressions | All 14 pass — `P06-F04-web-regression.log/json`; total unique verified web scenarios including F04: 17 |
| `npx playwright test --config playwright.mobile.config.ts --reporter=list` | All four mobile browser/API scenarios pass — `P06-F04-mobile.log`; feature archive `P06-F04-mobile/` |
| `npm run governance:v2:test`, `npm run governance:test` | 16 + 10 pass — `P06-F04-governance.log`, `P06-F04-governance-local.log` |
| Optimized local `npm run build` | Pass — `P06-F04-build-final.log` |
| `npm run typecheck` | Contracts/domain/FHIR/web pass — `P06-F04-typecheck-verified.log` |
| `npm run typecheck --prefix apps/mobile` | Pass — `P06-F04-mobile-types.log` |
| `npm run lint` | Pass — `P06-F04-lint-complete.log` |
| Original-row preservation | Schema 50 → 51; all original keys and original column values retained in 22 clinical/provenance/SMART/integration tables — `P06-F04-preservation.json` |
| Actual API operational cleanup | Five temporary subscriptions ended, twelve test connections disabled; historical progress remains readable and sensitive previews are blocked — `P06-F04-operational-cleanup.json` |

The final preservation comparison uses the consistent pre-upgrade `P06-F04-before.sqlite`. Compound primary keys are compared correctly. Added outbox recovery columns are excluded from old-column equality, rather than incorrectly treating additive metadata as clinical corruption. The existing Next config files were restored exactly to their captured starting SHA-256 hashes after verification. No clinical records were deleted for test cleanup.

FHIR resource serialization, profiles and source round-trip transformations are reused unchanged from F03. The existing official seven-case HL7 validator evidence remains in `P06-F03-validator/summary.json`, including its visible synthetic-terminology/narrative warnings. This feature does not claim a newly executed official-validator run, full HL7 Bulk Data support, licensed terminology validation or certification. CI retains the validator job and adds the bulk tests; no unexecuted remote CI success is claimed.

## Scenario oracles

1. Byte-identical signed manifests reuse one durable batch; conflicting bytes/signature domains, duplicate envelope keys and invalid bounds are rejected. Individual malformed records remain accounted-for quarantine outcomes rather than silently disappearing.
2. A seven-item signed sender/browser import applies six real clinical Observations and quarantines one malformed record. A browser reload retains cursor 5; the next reviewed page completes cursor 7 without replaying prior writes. The UI displays both result classes and passes Axe/390-pixel containment. Screenshots: `P06-F04/batch-desktop.png`, `batch-mobile.png`.
3. Duplicate source messages across separate pages account for every manifest item but create only two clinical records from three items. Completed page-key replay never processes a subsequent page.
4. A real child process is killed after its first actual file-backed COMMIT while its page lease remains running. Reopening observes exactly one source event and cursor 1. After lease expiry simulation, the same page command resumes to cursor 3 with exactly three total new source records. No production fault callback is added; interception exists only in the isolated test child.
5. Two separate SQLite processes race for a page; only one effective processing lease/source result is committed. A forced database failure at cursor 2 rolls back that item while preserving item/cursor 1; repairing the fixture and resuming the same run completes without duplication.
6. An out-of-order v2, malformed body and valid v1 complete with explicit partial outcomes. Reviewed recovery applies the original v2 as an append-preserving correction to the same clinical record. Malformed bytes cannot be promoted. An unmapped standalone receipt recovers only after the real authorized link service resolves its identifiers.
7. Foreign tenant/facility, unsupported purpose, nurse/admin clinical writes, stale expected cursor/version/hash, missing attestation and revoked sessions cannot process data. Dashboard cursors reject tampering, foreign scope and changed filters; no plaintext session appears in them.
8. Export captures an immutable source-version manifest, reports a changed source rather than substituting its value, and queues all unchanged items in resumable pages. Browser export accounts for every selected persisted Observation but reports `queued-delivery`, not acknowledgement.
9. Actual HTTP delivery exhausts five lost acknowledgements; audited redrive sends the same ID/body and a real receiver observes one unique message across six attempts. Prior attempts remain in immutable recovery history. Duplicate redrive command keys do not reset attempts again; a fourth generation is denied.
10. Source dependency downtime stops before cursor advancement. Cancellation retains prior source outcomes. Disabling a partner prevents preview/processing yet retains scope-checked historical batch progress; this is verified both in tests and actual post-simulation API cleanup.

The initial recovery browser scenario looked for newly submitted work in an existing queue snapshot; the test now explicitly uses the supported Refresh queue action before locating it. The older worker scenario now drains bounded worker passes until its own queued test job is reached; bulk movement invalidated its old assumption that a single twenty-job pass must include the newest job. Neither correction changes worker limits or retries failed HTTP assertions into success. Logs from the earlier run remain retained.

## Boundaries and continuation

Local imports are bounded to 100 messages/256 KiB, export manifests to 1,000 Observation IDs and processing to ten items per request. Inbound quantity-only and outbound component support follow F03. This does not implement general FHIR transactions, automatic patient matching, automatic ownership transfer or an external production delivery service. Operators retain signing roots and review prerequisites; an in-flight HTTP request cannot be recalled. All clinical/licensing and formal reviews remain pending separately.

P06-F04 local engineering is complete. P06-F05 conformance/R5 planning remains NOT_STARTED. No commit, push, merge, publication or deployment was performed for this feature.

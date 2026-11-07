# P06-F01 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING.

Scope: complete local synthetic source-mapping feature, not formal phase acceptance or production release. See the [contract/runbook](P06-F01-architecture-and-operations.md), [plan](P06-F01-plan.md), and [ADR-0071](../adr/ADR-0071-current-source-fhir-r4-previews.md).

## Implemented scope

Seven versioned R4 forward/inverse mappings, eight draft StructureDefinitions (seven resources plus the context extension), current persisted-record inventory/export and reverse-preview API, role-appropriate workbench, bounded request handling, source/facility/tenant/account authorization, stale-context conflict handling and PHI-safe audit are implemented. No migration is required: clinical facts and coding/catalog provenance stay in their existing authoritative storage. No source import write or external delivery was added.

The workbench is available at `/interop/source`, linked from Interoperability. It compares real persisted records, not fixed response fixtures. Existing legacy endpoints remain intact. API responses explicitly distinguish bounded mapping checks from the independently executed official profile validator.

## Executed verification

| Command / evidence | Observed result |
| --- | --- |
| `npm test` — `artifacts/governance-v2/P06-F01-domain-verified.log` | 450 pass, zero failures, including legacy FHIR and ten new source-mapping simulations |
| `npm run typecheck` — `P06-F01-typecheck-verified.log` | Contracts, domain, FHIR and web pass |
| `npm run build` — `P06-F01-build-verified.log` | Production-mode compilation and Next TypeScript checks pass under the local synthetic runtime configuration |
| `npm run lint` — `P06-F01-lint-verified.log` | Pass, exit 0 |
| `npm run fhir:test` — `P06-F01-tool-tests.log` | Four pass: two harness failure-detection tests and two HTTP transport/error-redaction tests |
| `node tools/fhir/install-validator.mjs` | Cached official 7.0.4 executable verified against full size and locked SHA-256 |
| `node tools/fhir/validate.mjs` — `P06-F01-validator/summary.json` and original logs/OperationOutcomes | Five expected outcomes pass; all three positive fixtures have zero errors; both negative cases rejected at the expected paths |
| P06-F01 Playwright suite | Two pass on final build — P06-F01-browser-verified.log/json |
| Existing web Playwright regression | 22 pass — P06-F01-web-regression.log/json |
| Governance tests | 16 + 10 pass — P06-F01-governance.log and P06-F01-governance-local.log |

Artifact names without a directory prefix in this table are under `artifacts/governance-v2/`. Raw reports are retained locally and CI is configured to upload the validator reports. Remote CI has not been run or claimed green in this local task.

## Simulation oracles

| Scenario | Required observed behavior |
| --- | --- |
| S01: all current source kinds | Exact source field and null preservation; decoding then re-encoding reproduces the whole supported resource |
| S02: quantity edit | R4 37.1 → 38.2 decodes to proposed source value 38.2; database value remains 37.1 |
| S03: duplicate MRN across two tenants | Both ACC-4401 values survive with distinct identifier namespaces and resource IDs; cross-tenant reverse requests fail |
| S04: unknown fields / references / intent | Unsupported facts are rejected rather than silently dropped; executable service/medication intent rejected |
| S05: stale/out-of-order source | Actual observation correction invalidates the old context; fresh revision round-trips |
| S06: authorization | Wrong tenant/facility, unprivileged and suspended actors denied server-side |
| S07: dependency / sandbox closure | Failure denies access; recovery reopens preview without altering the source |
| S08: restart / repeat | File-backed database reopen preserves fingerprint and repeated results with source counts unchanged |
| S09: workflow lifecycle | Routed request stays a draft proposal; cancelled request becomes revoked; completed visit becomes finished while original source states survive |
| S10: malformed/adversarial input | Invalid date, malformed envelope, oversized body, deep JSON and unknown modifiers rejected |

The 22 existing web regression cases ran before the final P06-only lifecycle/error-path corrections. The two new P06 scenarios, full domain regression, build/types/lint and five-case validator suite were rerun after those corrections.

Browser scenarios additionally create persisted clinical records through existing forms, round-trip every supported kind through authenticated HTTP, exercise edited-value comparisons, verify no-store/origin/auth/tenant/malformed/stale behavior, check network retry, and inspect accessibility and mobile width. Desktop/mobile screenshots are under `artifacts/governance-v2/P06-F01/`.

## Standards evidence and limits

The pinned validator is HL7 CLI 7.0.4, R4 4.0.1, SHA-256 `43e29fa8822d670740a909c395ca5b70a3d07fbaa8936f8dedc6a98b007f555b`. The final positive Patient, eight-resource collection and nine-resource lifecycle collection passed with zero errors; the deliberate missing-birth-date and executable-ServiceRequest cases each produced the expected one error. The final run retains the same strict success criteria and refuses stale/missing aggregate evidence.

Warnings are preserved, not suppressed: the initial valid Patient had one missing-narrative warning; the eight-resource collection had 18 warnings and the lifecycle collection had 20 warnings concerning absent full narratives and unregistered synthetic code systems. There is no remote terminology server (`-tx n/a`), licensed terminology validation, US Core assertion, clinical certification or production signoff. Public standards packages are engineering downloads only. Profiles are draft/experimental version 1.0.0.

## Failures investigated

The original bootstrap interruption from the earlier turn is superseded by actual completed validator executions. Terminal-state inspection also found the R4 con-4/con-5 conflict for resolved conditions subsequently entered in error. The mapper now omits both clinical status and abatement while preserving the original resolution date in context; actual command-driven lifecycle fixtures pass official validation. Patient inactive/merged state and replacement links are explicitly preserved. A final API boundary correction ensures storage failures during session lookup return a generic 503 OperationOutcome.

An initial browser assertion matched both the intended error alert and Next's empty route announcer; the test now selects the error text explicitly. A subsequent rerun collided with another browser suite's shared trace directory; the final P06 run uses its own output directory. Those failed logs remain available; they are not counted as passes. Visual inspection found native button styling, which was corrected to use the existing design-system classes and rebuilt before final screenshot verification.

## Remaining boundaries

Formal acceptance and qualified production reviews remain separate; no approval identities were invented. SMART authorization, partner import mutation/delivery/replay, bulk transfer and published phase-wide conformance/R5 planning belong to later features and remain unimplemented here. Reverse proposals do not authorize clinical actions or validate the clinical appropriateness of an edited value. No push, merge, publish or deployment was performed.

# Phase 05 local engineering exit — 2026-11-03

Local engineering: **VERIFIED within the authorized synthetic scope**. Formal acceptance: **BLOCKED / NOT GRANTED**. This report does not amend or replace protected formal registers, signatures or original governance evidence. Phase 02 reviews remain pending; formal Phase 04 remains NOT_STARTED. No qualified clinical, regulatory, licensing or jurisdiction approval has been supplied. Do not start Phase 06 without a new explicit product-owner instruction.

## Source scope and observed engineering boundary

Source: CuraSphere_Engineering_Specification_Pack_v1.0.docx §12, Phase 05. The source calls for a terminology service and controlled vocabularies to prevent semantic drift, including SNOMED/LOINC/ICD/UCUM mappings, local extensions, versioned code systems/value sets and formularies/facility catalogs.

Implemented scope is explicitly local synthetic engineering. Official-system metadata is reference-only: no licensed term content is imported or enabled, no clinical thresholds/protocols are approved, and no production clinical capability is activated. The restricted mathematical unit pack is not general UCUM conformance. Built-in source workflows retain their existing synthetic systems and validation rules; historical facts are never relabeled as licensed codes. Existing medication drafts remain non-executable and department requests remain untransmitted.

## Source exit-criterion matrix

| Original exit criterion | Engineering proof in the local synthetic scope | Formal limit |
| --- | --- | --- |
| Unknown codes fail safely | P05-F01 unknown/version/expiry/content rejection; F02 membership/dimension/alias/pack failures; F03 unresolved mapping responses never select targets; F04 stale/inactive/default/override/drug rejection; F05 forged/missing/stale/free-text picker rejection and database tuple/code-drift guards | No licensed standards corpus or clinical-site validation is claimed |
| Terminology versions are recorded with clinical records | Existing source system/code/version fields retained; schema-48 immutable source definitions and pins for condition/allergy/observation/medication draft/request; component/unit metadata preserved; schema-47 archived request snapshot retains original catalog and concept version across change/closure/reopen | Older unpinned records explicitly remain historical; no invented backfill or retrospective signoff |
| Mapping provenance is visible | F03 immutable mapping versions, equivalence, interval, source, reviewer and decision history; F05 exact-tuple mapping inspection from current definitions and patient-authorized recorded coding provenance | Synthetic review actors test workflow behavior only; no clinical equivalence or entitlement approval |

## Feature evidence

| Feature | Local engineering scope | Evidence |
| --- | --- | --- |
| P05-F01 | Controlled release metadata, rights boundaries, immutable concepts/pins, safe lookup | P05-F01-evidence.md |
| P05-F02 | Immutable value sets, membership validation, restricted rational unit conversion | P05-F02-evidence.md |
| P05-F03 | Independent mapping adjudication, explicit ambiguity/non-equivalence, versioned provenance and revocation | P05-F03-evidence.md |
| P05-F04 | Organization defaults, active-facility overrides, immutable original request catalog snapshot | P05-F04-evidence.md |
| P05-F05 | Shared clinical code pickers, revision validation, immutable source coding and metadata conformance | P05-F05-evidence.md |

The experimental register records engineering verification separately from formal acceptance. No feature has received a fabricated qualified human approval. The original governance runner still covers its original authorization; its tests do not accept Phase 05 merely because they pass. Legacy test output naming later phases is implementation coverage, not permission to advance or formal acceptance.

## Architecture and ownership

Additive schemas 44–48 extend the existing local SQLite domain; no new clinical stack or provider replaces existing functionality. Source facts remain authoritative. Definitions, code versions, value sets, mapping proposals/decisions and original request snapshots are immutable where required. Mutable catalog heads are explicit CAS pointers to retained versions. No model output chooses a clinical mapping or overrides a safety gate.

All new API boundaries use current workforce sessions, server-derived organization/facility, active-account and permission checks, local synthetic guards, bounded/known-field metadata inputs, parameterized queries and no-store responses. New browser writes reject a foreign Origin. Resource provenance first uses the existing patient/order authorization service. Audit/ledger and outbox remain local, tenant-scoped and transactional; metadata events omit patient observations/doses. Existing read-only mobile behavior and separate authenticated web handoffs remain.

API/UI contracts, state models, risks, runbooks and rollback are in each P05-Fxx-architecture-and-operations.md, with pre-code plans and executed scenario evidence beside them. New screens are reachable through the local Terminology registry; clinical source/work screens retain their original workflow paths and code metadata. No new permanent mocked runtime is introduced.

## Verification and failure recovery

Final executed commands/results and artifact paths are recorded in P05-F05-evidence.md. The final domain suite has 440 passing tests, including all prior feature scenarios and new coding conformance. The complete final web suite passes 22/22, mobile browser/API suite 4/4, governance suites 10/10 and 16/16, and restricted-origin unit test 1/1. Final production build, standalone workspace/mobile TypeScript and lint pass. No intermediate failed result is relabeled; fixture/environment/type/UI defects and their passing retests are recorded in the evidence.

The authenticated final active-facility conformance snapshot contains 35 source records with zero missing code/system/version fields, 14 newly pinned definitions and 21 explicitly historical unpinned records. It is saved in artifacts/governance-v2/P05-F05-conformance-snapshot.json. These are metadata coverage counts, not approved clinical or licensed-standard conformance. Desktop/mobile and accessibility/overflow checks passed and screenshots were visually inspected.

Failure evidence includes transactional DDL marker recovery, source/catalog/mapping/outbox/pin rollback, persistent reopen, original metadata after correction/closure, tenant/role/consent/clinical safety denial, independent review, stale/concurrent command conflict/replay, dependency outage, retained history without current terminology and production-environment denial. Browser repeatability uses real available scheduling slots without deleting retained bookings or bypassing capacity.

Before each migration, a consistent VACUUM INTO snapshot was taken. The schema-47 pre-final-feature backup and ID-preservation check are recorded in P05-F05-backup.log and P05-F05-migration-preservation.log under artifacts/governance-v2. Operational rollback is compatible application access removal with immutable data retained, not destructive schema downgrade. Disposable fixture teardowns remove new extensions in reverse order. No restoration discarded newer user activity.

Operational observability consists of persisted source/version heads, queue reasons, metadata coverage and history/pin counts, audited outcomes and durable outbox receipts. No production latency, availability, load capacity, clinical efficacy or standards certification is inferred. Real-device/mobile clinical validation and licensed-corpus conformance are not established by browser simulations.

## Remaining blockers and STOP

Formal prerequisite/governance reviews, first production jurisdiction/intended-use decisions, verified terminology entitlements, qualified clinical/privacy/regulatory/architecture acceptance and actual site/production validation remain external requirements. They cannot be self-approved by an AI agent or supplied by a synthetic reviewer identity. Protected source phase/feature registers remain unchanged. The current local engineering branch remains uncommitted; no push, merge, publish or deployment was performed.

**STOP at Phase 05. Phase 06 has not been started by this work.**

# P05-F02 — Versioned value sets and restricted unit inspection

## Decision and intended use

Schema 45 adds organization-scoped immutable value-set versions, pinned members and command receipts. It does not modify the legacy global value_sets/value_set_members or clinical records. Each member retains the registered release ID, concept ID and therefore exact system/code/version/provenance. A receipt seals the set; updates/deletes are prohibited. Correction requires a new version. Source release effectiveness is checked at validation time, so membership never revives expired content.

P05-F01 passed its engineering dependency checks. The subsequent product-owner continuation permits this gated, test-only work under IMPLEMENTATION_POLICY.md; it does not supply formal acceptance or a clinical/license approval. Human approval remains pending for clinical use. This inspector has no clinical mutation path.

## Restricted conversion pack

Pack curasphere-units-2026.11.1 is independently authored conversion code using exact rational arithmetic. It is not the UCUM distribution, a general UCUM parser, or a claim of UCUM conformance. The [UCUM specification](https://ucum.org/ucum) and [publisher license](https://ucum.org/license) are external references for future integration review. No terminology content bundle or dependency is downloaded or imported here. Existing reference-only licensing restrictions remain unchanged.

Supported symbols are case-sensitive: kg/g/mg; m/cm; L/mL; K/Cel/[degF]; g/L/mg/L/mg/dL; mol/L/mmol/L. Canonical units respectively are kg, m, L, K, g/L and mol/L. Unknown or ambiguous symbols, annotations, compounds outside this list and aliases are rejected, including ml, U and mmHg. No molecular-weight conversion from mg/dL to mmol/L is inferred. No clinical thresholds or dose guidance are provided.

The API accepts a decimal string, not a JSON number: at most 12 integer digits and 9 fractional digits; no exponent, plus sign, leading zeros, whitespace, locale comma, Infinity or NaN. Precision is an integer 0–6. Rational factors/offsets are evaluated before rounding. Ties round away from zero; zero has no negative sign. Output and canonical values are decimal strings rounded to the requested precision, never stored as unrounded source observations. Pack version and rounding rule are returned explicitly. Unsupported pack versions fail closed. Values below absolute zero are rejected; no clinical plausibility limits are inferred for other dimensions.

## Contracts

All routes require an active workforce session, active organization/facility authorization and the local synthetic sandbox. Reads/inspection require terminology.read; registration requires terminology.manage. No patient identifier is accepted. No-store responses use contractVersion 1. Foreign browser Origin is denied. Inputs reject unknown fields and manifests over the shared JSON limit.

| Route | Request / response |
| --- | --- |
| GET /api/terminology/value-sets | Up to 100 scoped immutable summaries |
| POST /api/terminology/value-sets | name, version, members[{system,version,code}], idempotencyKey; 201 receipt or 200 identical replay |
| POST /api/terminology/validate | valueSetId, system, version, code; valid=true and pinned set/concept provenance on success |
| POST /api/terminology/convert | value, from, to, precision, packVersion; input/output/canonical quantity, dimension, packVersion, precision, rounding, synthetic and scope |

401 requires reauthentication; 403 denies permissions, foreign origin or restricted content; 404 hides unknown/foreign value sets; 409 is an immutable version or changed-retry conflict; 422 is invalid/unknown/unsupported/nonmember input; 503 is dependency failure. There is no nearest-match or unit-guess fallback. Registration, pinned members, idempotency receipt, audit and terminology.valueset.registered.v1 outbox metadata commit atomically. The outbox contains set ID/version/digest only; no clinical quantities or patient data. No delivery provider is enabled.

## User and operator guidance

Open Terminology → Code validation and unit conversion. Administrators first register a synthetic code-system release, then a value-set version containing exact system/version/code references. Inspect the manifest digest and linked release provenance. Permitted staff validate an explicit tuple, or inspect quantities using supported unit symbols. Changing input clears prior results; validation errors remain visible. A network error offers retry without claiming a saved clinical record. The registration form keeps its idempotency key; do not change the submission to recover an uncertain connection result. Mobile uses the existing separately authenticated web handoff.

Operational signals are persisted audit actions terminology.valueset.register/read/list, terminology.membership.validate and terminology.units.convert, with success/denied outcomes; conversion quantity payloads are excluded. Value-set/member counts and durable outbox receipts provide reconciliation. Dependency control terminology_registry_controls.dependency=unavailable denies all tools and shows a retryable error. Investigate repeated denied inspections or undelivered local outbox receipts; do not silently enable content or infer equivalence to restore service.

Rollout is local only. A consistent VACUUM INTO schema-44 snapshot precedes migration (path in artifacts/governance-v2/P05-F02-backup.log; 21 patients, 8 registered releases). DDL and version-45 marker commit together. On failure, keep the previous compatible application and repair the dependency/DDL conflict before retry. After migration, do not run older schema-44 code against the newer database. Operational rollback disables new routes and retains immutable data; fixture-only rollback is for disposable tests. Restoring a snapshot discards newer activity and must not be used as a live downgrade shortcut.

## Hazards and boundaries

Semantic drift is controlled by immutable pins, tenant constraints and active-release checks. Numeric drift is controlled by exact rational computation and explicit decimal rounding. Unknown/ambiguous codes and dimensions are explicit failures. Tests cover persisted reopen, retry/conflict, scope/permission, immutable/sealed members, atomic write failure, migration failure/recovery, negative/tie/offset/bounds cases, unavailable dependencies and production denial. No clinical source is rewritten. Formal Phase 02 reviews, clinical integration review, licensed-content entitlement and formal phase acceptance remain unresolved. Mapping adjudication and catalogs are later features.

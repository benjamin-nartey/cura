# ADR-0068 — Clinical source entries

Status: experimental engineering record. This ADR does not authorize Phase 04, clinical signing, or production use.

## Decision

P04-F03 stores versioned clinical source entries in chart schema 40. The earlier `conditions`, `allergies`, `observations`, and `medications` tables remain the legacy chart rows used by existing workflows. New source rows are not copied from those tables and do not replace them.

Each source mutation inserts an immutable `source_versions` snapshot. Updates and deletes of that table are rejected by triggers. The current row holds the latest version. A correction does not remove the earlier snapshot.

Appointment and visit-encounter lifecycle from P04-F02 is unchanged. A source entry must reference an in-progress visit encounter for ordinary recording. A completed encounter rejects ordinary recording and still allows an authorized amendment.

Medication orders are drafts only. `executable` is constrained to 0 and `transmission` is constrained to `disabled`. `clinical.sign`, pharmacy transmission, dispensing, and administration are not enabled.

Terminology is a local synthetic catalog. It is not a SNOMED CT, LOINC, ICD, or UCUM conformance claim.

No AI service creates or changes these rows.

## Consequences

History is reconstructed from `source_versions`. Optimistic concurrency uses the row version. Idempotency uses `source_commands`. Production destructive retention stays disabled. The next feature, P04-F04, is not started by this decision.

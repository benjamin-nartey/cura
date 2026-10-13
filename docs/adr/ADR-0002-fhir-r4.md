# ADR-0002: Local FHIR R4 projection

Status: Accepted
Date: 2026-10-08

## Context
Phase 06 asks for FHIR R4 mapping, an R5 plan, SMART on FHIR, subscriptions, and bulk export. This machine still has no JDK and no OIDC provider. ADR-0001 keeps the local chart on TypeScript and SQLite.

## Decision
Serve FHIR R4 JSON from the source rows at `/api/fhir/r4`. The conformance statement says version 4.0.1 and does not advertise SMART. Authorization is the existing directory session. R5 is a later path over the same rows, not a second copy of the chart, and it is not served now.

Observation create accepts a LOINC code and a number, then stores the row through the facility catalog. Display, unit, threshold, and effective time come from the server. Subscriptions write a notification into a local inbox. An outside URL is rejected. `$export` writes a job row and, when that job is read, builds NDJSON from the current facility rows.

CI checks the resources we emit with a structural R4 check. The HL7 Java validator is not in CI.

## Consequences
Clients can round-trip Patient, Observation, Condition, AllergyIntolerance, MedicationStatement, and Encounter for one facility. They cannot present a SMART token, receive an outbound webhook, or download a frozen bulk-data file. Rollback remains deleting `data/curasphere.sqlite`.

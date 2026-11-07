# P06-F01 — Current-source R4 preview contract and operations

Authority and scope: local synthetic engineering under the product owner's clarified simulation instructions. See [plan](P06-F01-plan.md) and [ADR-0071](../adr/ADR-0071-current-source-fhir-r4-previews.md). Formal acceptance is not implied.

## Data and mapping ownership

Authoritative data remains in `patients`, `visit_encounters`, `source_conditions`, `source_allergies`, `source_observations` plus components, `work_orders`, and `source_medication_orders`. Existing bounded contexts authorize reads before projection. Coding/catalog snapshots come from the existing provenance APIs. Derived R4 resources are recomputed from those rows. No migration, duplicate clinical repository, import receipt or new outbox is needed for a read-only comparison. Historical amendment streams and patient contacts/registrations remain in their existing APIs; this profile describes the current row and its coding/catalog provenance.

| Source | R4 profile | Important preservation rule |
| --- | --- | --- |
| Patient master | source-Patient | Namespaced MRN, names, birth date, inactive/merged replacement state; recorded sex retained without guessing gender |
| Outpatient visit | source-Encounter | In-progress/completed mapped to in-progress/finished; original status preserved |
| Condition | source-Condition | Exact source coding, verification, clinical state and date/null distinctions |
| Allergy finding | source-AllergyIntolerance | Unknown and none-known retained as distinct synthetic concepts; never inferred as a confirmed allergy |
| Vital source | source-Observation | Quantity/components, original synthetic units and effective/recorded times preserved |
| Department request | source-ServiceRequest | Submitted/routed remain draft proposals; cancelled becomes revoked |
| Medication draft | source-MedicationRequest | Proposal/draft or cancelled; never executable, signed or transmitted |

All profiles and mapping contracts are version 1.0.0, R4 4.0.1, draft/experimental. Canonical root: `https://curasphere.local/fhir/StructureDefinition/`. These local identifiers do not claim a publicly hosted conformance server. `packages/fhir/src/index.ts` declares the new mapping boundary while preserving the legacy descriptor.

## API and UX

`GET /api/integrations/r4/preview?patient=<source-id>` lists at most 30 authorized records per kind. `GET ...?type=<R4-type>&id=<source-id>` returns contractVersion, mappingVersion, sourceFingerprint and the current resource. Duplicate/unknown query keys are rejected. Responses are private/no-store and do not enable CORS.

`POST /api/integrations/r4/preview` accepts the resource JSON (100,000 byte transport limit; bounded nested JSON). It reauthorizes the exact persisted record, verifies current source context, decodes mapped fields, and rejects unsupported content. It returns type, sourceId, sourceVersion, fingerprint, changedFields, proposedSource, roundTripExact, applied=false and externalDelivery=false. Repeating a comparison does not mutate the source or require an idempotency receipt. Lifecycle transitions, code substitution, unit conversion, reference reassignment and executable intent are not accepted as preview edits.

Errors are OperationOutcomes: 401 sign-in, 403 origin/sandbox/role/account, 404 scope or missing record, 409 stale context/source dependency conflict, 422 malformed/unsupported input, 503 unexpected storage/dependency failure. Unknown internal exceptions produce generic diagnostics, not SQL or clinical payload logs.

`/interop/source` is linked from Interoperability. Its patient and record selections use actual persisted data. Initial selection, missing records, role denial, loading, cancellation, network failure/retry, stale context, malformed JSON and successful comparison have explicit states. JSON is escaped text; responsive text areas/preformatted output wrap within the page. Reloading replaces the baseline with the current persisted source.

## Security and simulation boundaries

Existing source-read permissions apply for each resource. Inventory additionally requires patient.read. The account must be active in the same organization, have an active facility authorization, and see the patient's original or active registered facility. Foreign records are never decoded into returned proposed data before authorization. Audit actions `fhir.source.preview` and `fhir.source.reverse-preview` record resource IDs/outcomes only, not clinical values or resource JSON. Existing audit timestamps, session attribution, access-ledger and audit querying remain available. These events provide outcome/failure counts for local monitoring; no public metrics endpoint exposes patient IDs.

Local internal treatment preview does not release data to a partner or use research/communication consent. It grants no external sharing permission and cannot dispatch a consent job. Production, real-PHI and live-provider configurations are rejected by the existing four-flag sandbox gate. F02/F03 must implement their own authorization, consented delivery and replay contracts before adding external operations.

## Run and verify

```text
node tools/fhir/install-validator.mjs
node --test tools/fhir/validate.test.mjs
node --import tsx --import ./packages/domain/test/dev-env.ts --test packages/domain/test/fhir-source.test.ts
npm run fhir:fixtures
npm run fhir:validate
npm test
npm run typecheck
npm run lint
npm run build
npx playwright test tools/e2e/p06-f01.spec.ts
```

Java 21 is required; `CURASPHERE_FHIR_JAVA` may specify the executable. Fixture generation creates an isolated SQLite scenario via real scheduling/clinical/work commands, then exports all seven source kinds including both observation shapes. Random domain IDs/session IDs are expected; clinical facts and expected semantic oracles are reproducible. Generated profiles can be reproduced with `node tools/fhir/generate-profiles.mjs`. The CI `fhir-source-profiles` job checks the same locked validator and current mapper-generated fixtures. A corrupt cached JAR fails closed; replace only that verified artifact before retrying installation.

Validator output is under `artifacts/governance-v2/P06-F01-validator/`, including unfiltered OperationOutcomes, logs and summary. Do not count a process interruption, missing outcome, incorrect negative-case error or malformed evidence as a pass. Warnings remain visible; synthetic coding namespaces have no independent terminology definitions, and generated previews have no full human-readable narrative. No clinical/terminology conformance claim follows from zero profile errors. CI execution is configured; local execution is the evidence until a remote job actually runs.

## Failure, recovery and rollback

Dependency unavailable: return the existing source dependency conflict; restore the dependency and reload the preview. Stale context: return 409 and reload rather than forcing the old revision. Database unavailable: return 503, keep previous UI content available for retry, and do not apply any resource. Network cancellation stops the preview fetch; no clinical writes need reversing. Database reopen tests verify the same fingerprint and repeated reverse results, with source counts unchanged. Production-override closure immediately denies subsequent calls; restoring the local sandbox restores preview access.

No migration or schema reversal is required. Removing the additive routes/components/modules is a code rollback; all existing sources, coding pins and legacy FHIR endpoints survive. Do not delete clinical data or audit evidence to reset a simulation. If the validator fails, preserve its logs, correct mappings/profiles/fixtures and rerun the affected suite before recording verification.

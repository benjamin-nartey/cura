# Controlled terminology release registry

## Decision

Extend the existing global code_systems/concepts model with organization-scoped release receipts rather than replace clinical references. Schema 44 adds immutable releases, pinned concepts, idempotency receipts and a dependency control. Existing vocabularies remain intact and are not automatically treated as verified releases. Registered metadata and pinned concepts cannot be changed or deleted. The completed command receipt seals the pin set.

Registration, concept pins, command receipt, outbox metadata and audit record share one SQLite transaction. The normalized manifest SHA-256 identifies submitted metadata and concepts; it does not certify clinical correctness or licensing. Actor and normalized payload bind retries. Reusing a key with a different submission returns conflict. No external event delivery is enabled.

## API and access

GET /api/terminology/releases accepts q and returns at most 100 organization-scoped releases. POST accepts systemUri, name, version, edition, activeFrom, optional activeTo, rights, sourceUrl, sourceNote, concepts and idempotencyKey. Unknown fields are rejected. Concepts contain code/display pairs. Registration returns 201, identical replay 200, changed replay 409. GET /api/terminology/lookup requires explicit system, version and code; unknown or ineffective versions/codes return 422. Reference-only content lookup returns 403. All responses use no-store.

Active workforce sessions and membership are required. Organization administrators manage releases; permitted clinical staff and auditors read them. No patient portal access is granted. Browser writes reject a foreign Origin. JSON input is bounded, parameterized database access is used, and provenance URLs require HTTPS without credentials, query tokens or fragments. UI exposes permission, validation and dependency failures without fabricating records. Mobile has an account-section handoff to the registry with separate web authentication and no session tokens in URLs.

## Rights boundary

Only locally authored concepts under urn:curasphere:synthetic:ORGANIZATION: are accepted. Official systems are reference metadata only, with no terminology content imported or activated. Relevant publisher references checked on 2026-11-03: [SNOMED licensing](https://www.snomed.org/get-snomed), [LOINC license](https://loinc.org/license), [WHO ICD API license](https://icd.who.int/docs/icd-api/license/), [UCUM license](https://unitsofmeasure.org/license), and [CDC ICD-10-CM files](https://www.cdc.gov/nchs/icd/icd-10-cm/files.html). These links establish sources for a future entitlement review, not acceptance of terms or permission to distribute content.

## Migration and recovery

Schema 43 upgrades additively to 44. New DDL and its version marker are transactional. Failure leaves version 43 recoverable; tests inject a DDL failure and verify repair. Existing patients, clinical records, billing and ledger data are retained.

Before local rollout a consistent VACUUM INTO snapshot was saved under ignored artifacts/governance-v2/P05-F01-before-b6728977-60b0-4f60-917f-f35a9225ccf3.sqlite (source schema 43, 21 patients). Do not copy a live WAL database file as a backup.

Operational rollback retains immutable terminology records: remove application access and stop writes, then deploy a compatible application. Do not run older schema-43 code against a schema-44 database. Restoring the pre-migration snapshot is only suitable for this disposable simulation when loss of subsequent activity is explicitly acceptable. CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK exists only for isolated test fixtures; it is not an operational downgrade procedure.

## Boundaries

F01 does not rewrite clinical records, normalize measurements, adjudicate mappings, enable formularies, import licensed standards, or activate production clinical functions. These remain subsequent features or external approval requirements. Original governance records and historical acceptance evidence remain unchanged.

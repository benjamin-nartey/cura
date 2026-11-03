# ADR-0066 — Patient and practitioner master records

## Status

Experimental engineering record for local P04-F01. This ADR does not authorize Phase 04, production clinical use, or a change to formal governance.

## Decision

The chart SQLite `patients` table remains the authoritative clinical patient record. P04-F01 extends that table and adds identifier, contact, facility-registration, version, duplicate-candidate, and merge tables in schema 38.

Foundation Postgres `patients` stays the earlier directory projection. P04-F01 does not write it and does not treat it as a second clinical source.

Practitioner records are a separate table. A workforce user becomes a practitioner only through an explicit link to an active membership and an active issuer/subject identity. The link does not change role permissions. An email address is not an identity proof. Synthetic licenses stay `fictional-unverified`.

## Identifier scope

A local medical record number is unique inside one organization and one identifier system. The same value may exist at another organization. Name, birth date, or phone number alone does not prove that two rows are the same person.

## Duplicate handling

Candidates are opened from documented rules: same organization plus the same identifier system and value; same organization plus the same normalized given name, family name, and birth date; or same organization plus the same contact value. Same birth date alone is not a match. Another organization's record is not a candidate.

No job merges patients. A merge requires `patient.merge`, a different person from the one who opened the candidate, the current candidate version, and an explicit surviving record. Conditions, allergies, medications, encounters, and observations stay on the retired row and are recorded as blocked resources. The retired row keeps its identifiers and gains `registration_status = merged`.

## Privacy

Registration does not create or infer consent. Privacy subjects become patient links only through `linkVerifiedSubject`. Clinical master retention is `retain` with `pending_policy_approval`. Disposal is refused. Audit and ledger writes carry identifiers, not names or contact values. Ordinary telemetry drops unknown fields such as names and record numbers.

## Consequences

Schema head is 38. Rollback is `MASTER_ROLLBACK`, which drops the master tables, deletes migration 38, and leaves patients in place. Re-opening the database applies schema 38 again.

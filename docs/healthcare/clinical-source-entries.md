# Clinical source entries

Experimental behavior for P04-F03. This is not a clinical validation and not a FHIR conformance claim.

## Ownership

A source entry references an active patient, the session organization and facility, an affiliated practitioner, and a visit encounter. A merged patient is rejected for a new entry. Existing rows keep their original `patient_id`.

The legacy chart tables are not the versioned source. Schema 40 adds `source_conditions`, `source_allergies`, `source_observations`, `source_observation_components`, `source_medication_orders`, and `source_versions`.

## Condition transitions

Clinical status: `active` may become `resolved` or `historical`. `resolved` may become `historical`. `historical` does not return to `active`.

Verification: `unconfirmed` may become `confirmed` or `entered-in-error`. `confirmed` may become `entered-in-error`. Recording an unconfirmed entry leaves it unconfirmed.

## Allergy transitions

Finding comes from the catalog: `documented`, `none-known`, or `unknown`. Unknown is not stored as no known allergies.

Clinical status: `active` may become `inactive`. Verification: `unconfirmed` may become `confirmed`, `refuted`, or `entered-in-error`. An entered-in-error row stays readable.

## Observations

Quantity observations use one catalog unit. Blood pressure uses components `syn-sbp` and `syn-dbp` in `mm[Hg]`. Effective time and recorded time are separate columns. A finalized value is corrected by a new version, not by `replaceObservation`, which is rejected.

## Medication drafts

Status `draft` may be amended or cancelled. Cancellation of a cancelled draft is rejected. Signing calls `clinical.sign` and is denied. Transmission is denied and writes no outbox event.

## Catalog

Local system versions `2026.10` for condition, allergy, observation, and medication codes, with unit system `curasphere.synthetic.ucum-style/2026.10`. Unknown codes fail. Values outside the catalog range fail. Units are not converted.

## API

Session-scoped routes under `/api/clinical/conditions`, `/api/clinical/allergies`, `/api/clinical/observations`, and `/api/clinical/medication-orders`. Conflicts redirect with `source`, `source-stale`, or `source-closed`. The server does not accept a client organization id or a signing flag.

## Screens

`/clinical`, `/clinical/conditions/new`, `/clinical/allergies/new`, `/clinical/vitals/new`, `/clinical/observations/{id}`, `/clinical/observations/{id}/correct`, `/clinical/medications/new`, `/clinical/medications/{id}`, and `/clinical/history`.

## FHIR note

The rows can later be mapped toward Condition, AllergyIntolerance, Observation, MedicationRequest, and Provenance. That mapping is not implemented here.

# RFC: Terminology pin for the local chart

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Observation and problem codes were a hardcoded list. A later change to that list could change what an old row means, and a facility could not have its own catalog.

## Goals / non-goals
Goals: versioned code systems, a facility value set, rejection of unknown codes, and the version stored on the source row and shown on the chart.

Non-goals: the full LOINC, SNOMED CT, or ICD distributions, a terminology server product, and rewriting historical rows when a pin changes.

## Proposed design
SQLite holds `code_systems`, `concepts`, `value_sets`, and `facility_catalogs`. Recording an observation resolves the code through the session facility's value sets. Display, unit, and bounds come from that row. The observation stores LOINC version, UCUM version, and the local binding id. Problem rows store the ICD-10-CM version they were filed with.

This is a curated subset labeled with the published version it was taken from. It is not a claim that the full code system is loaded.

## Security and privacy
The catalog is not patient data. Failed codes are rejected before a row is written. Facility context still comes from the session, so one facility cannot enable another's value set by sending it.

## Clinical hazards
A bound is a local binding, shown separately from the LOINC pin, so a reader can see it is not the code system itself. Old rows keep the version they were stored with.

## Rollback
Schema version 2 adds columns and tables. Rolling back the application without the columns will fail to open the file. Restore by stopping the app and deleting `data/curasphere.sqlite`, which also deletes local chart writes.

## Tests
`npm test` covers an unknown code, a known code that is not on the facility catalog, the Lakeside BNP exclusion, and the versions stored on a new potassium result.

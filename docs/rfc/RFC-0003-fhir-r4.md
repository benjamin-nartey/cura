# RFC: Facility chart as FHIR R4

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
The chart is only available through the clinician pages. A standards client needs the same source rows as R4 resources, without a second record and without a token that this server cannot verify.

## Goals / non-goals
Goals: R4 read of the core chart, create of a final Observation through the facility catalog, a conformance statement, a facility NDJSON export, and a local subscription inbox.

Non-goals: R5 responses, SMART on FHIR, outbound HTTP, the HL7 Bulk Data file protocol, US Core certification, and the HL7 Java validator.

## Data flow

```
directory session
    |
    v
/api/fhir/r4  ----read/search----> source rows (patients, observations, conditions, allergies, medications, encounters)
    |                                      ^
    | create Observation                   |
    +----> facility catalog ---------------+
    |
    +----> export_jobs ----read----> NDJSON built from those rows
    |
    +----> fhir_subscriptions ----on observation.recorded----> fhir_notifications (local inbox)
```

Trust boundary: the session cookie. Organization and facility are taken from the session. Resource ids in the body do not select a facility.

## Proposed design
`GET /api/fhir/r4/metadata` returns a CapabilityStatement for FHIR 4.0.1. It lists read and search for the core types, create for Observation and Subscription, and the `$export` operation. `rest.security` has no SMART service.

`POST /api/fhir/r4/Observation` requires `Idempotency-Key`. The LOINC code must be on the facility catalog. A client unit, if sent, must match the pin. The server writes the source row and returns the R4 resource, including the LOINC version and the local binding extension `urn:curasphere:binding`.

`POST /api/fhir/r4/Subscription` accepts criteria `Observation` and channel endpoint `local-inbox` only. Recording an observation copies a history Bundle into `fhir_notifications` in the same transaction. `GET .../Subscription/{id}/$events` returns those bundles for the session facility.

`POST /api/fhir/r4/$export` records an export job. `GET /api/fhir/r4/$export/{id}` returns NDJSON generated at read time from the job's facility. A job from another facility is not found.

R5 plan: when an R5 path is added, it will be `/api/fhir/r5` over these same rows. This server will keep answering 4.0.1 on `/api/fhir/r4`. MedicationStatement stays until a later mapping decides otherwise. No R5 resource is emitted in this slice.

## Security and privacy
Cross-facility reads return the same not-found outcome as a missing id. The audit row still records `denied` when the id exists elsewhere. Auditors receive 403 and no chart payload. Webhook URLs are rejected so the server does not call arbitrary hosts. Export and search are limited to the session facility. The conformance document contains no patient data and does not require a session.

## Clinical hazards
The R4 Observation is a projection of the source row. The threshold flag is the configured binding, carried in `interpretation` and named again in the binding extension. The resource does not add a diagnosis or a recommendation. Client text for the display is ignored; the pin's display is stored.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Cross-tenant read by id | Session facility filter; identical not-found body | Evan cannot read Elena |
| Auditor bulk access | `canReadChart` on read, search, and export | Priya receives 403 |
| SSRF via subscription endpoint | Only `local-inbox` | Remote URL rejected |
| Client-supplied unit or flag | Catalog unit required; interpretation rejected if sent | Mismatched unit rejected |
| Export of another facility's job | Job row stores organization and facility | Lakeside cannot read a Riverside job |

## Rollback
Schema version 3 adds `fhir_subscriptions`, `fhir_notifications`, and `export_jobs`. Rolling back the application without those tables will fail to open the file. Stop the app and delete `data/curasphere.sqlite`. Local chart writes are deleted with it.

## Tests
`npm test` covers the observation round-trip, code-system versions on seeded resources, the capability statement, cross-facility and auditor denial, unit and inbox rejection, the local notification, and facility export contents.

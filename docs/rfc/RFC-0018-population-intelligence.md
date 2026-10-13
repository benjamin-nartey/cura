# RFC: Population intelligence

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An auditor needs organization-level counts of stored problems and results without a list of the people in those groups.

## Goals / non-goals
Goals: pinned cohorts, a minimum of 5, a jurisdiction tag that can withhold every count, and fixed sentences for vaccination and maps when those sources are absent.

Non-goals: a case list, a diagnosis, an outbreak detection, a vaccine registry, a map, and a model-written narrative.

## Data flow

```
session organization, auditor, purpose AUDIT
    |
    v
jurisdiction tag
    |  missing or restricted => withhold, no counts
    |  local-synthetic => count distinct patients
    v
cohort
    |  total below 5, or a facility remainder would reveal a smaller group => hide the count
    |  otherwise release the total and facility cells of 5 or more
    v
scan for name, MRN, or birth date
    match => withhold
```

The queries filter the session organization. Patient ids are counted and not returned.

## Proposed design
`POST /api/population/jurisdiction` and `POST /api/population/build`. Outbox events `population.jurisdiction` and `population.build` carry the tag or the version, not a patient id. Audit actions use the `population.*` names. Pins: `population-jurisdiction-2026.10`, `population-privacy-2026.10`, `population-cohorts-2026.10`.

## Security and privacy
Another organization's patients are not counted. A clinician cannot open the page. A suppressed cohort does not include its code or its facility id.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician reads a cohort | Role and purpose are checked first | Amira is forbidden |
| A single diagnosis is listed | Groups below 5 omit the code and the count | E11.9 is not in the snapshot |
| A small facility is inferred from a total | The total is shown only when it equals the sum of cells of 5 or more | One East Annex result hides the whole systolic cohort |
| Another tenant is included | The count queries use the session organization | Samir is not in the Harborlight snapshot |
| A name is copied into the sentence | The body is scanned before it is stored | Nora is not in the released snapshot |
| A client sets an arbitrary statute | The tag must be `local-synthetic` or `restricted` | `EU-GDPR` is refused |

## Observability
`GET /api/health` reports schema version 17. Audit rows record population reads, tag changes, and builds.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 17. That deletes local writes.

# RFC: Imaging metadata

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs a record that a study was requested or performed, without pretending that image bytes or an interpretation arrived.

## Goals / non-goals
Goals: facility-scoped study metadata, a typed report linked to that study, a de-identified metadata release, and a gateway refusal for interpretation.

Non-goals: a DICOM association, DICOMweb retrieval, pixel storage, an image viewer, and diagnostic imaging AI.

## Data flow

```
clinician session, facility from the directory
    |
    v
study metadata (accession, modality pin, date, short description)
    |  payload over 1024 characters => refused, nothing stored
    v
optional typed report, one per study
    |
    v
release copy: modality, study date, facility id
    |  name, MRN, or birth date in that copy => withhold
    v
gateway explain => refused; the pinned sentence stays
```

Organization and facility come from the session. The release does not update the study row.

## Proposed design
`POST /api/imaging/study`, `/report`, `/release`, and `/explain`. Outbox events `imaging.study`, `imaging.report`, and `imaging.release`. Audit actions use the `imaging.*` names.

## Security and privacy
An auditor cannot open the list. Another facility is not listed. The release body is scanned before it is kept. The explain route does not pass a model adapter.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Pixel data is stored as a study | Payloads over 1024 characters are refused | A 2048-character description stores no row |
| An auditor reads a study | Role and facility are checked first | Priya is forbidden |
| Another facility sees the study | Queries filter the session facility | Lea’s list omits the Riverside study |
| A release copies a name | Patient, accession, and description are omitted, then the body is scanned | The released body has no Elena |
| A model writes an impression | The gateway refuses clinical generation, and the hold ignores model text | The sentence stays the pinned note |

## Observability
`GET /api/health` reports schema version 19. Audit rows record reads, study writes, reports, releases, and explain attempts.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 19. That deletes local writes.

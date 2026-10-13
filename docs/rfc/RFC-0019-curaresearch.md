# RFC: CuraResearch

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An auditor needs a frozen copy of the de-identified population counts, with a second person before that copy is released as an export.

## Goals / non-goals
Goals: a purpose-bound workspace, ethics metadata that does not claim an approval, immutable dataset versions, a two-person export, and provenance back to the population build.

Non-goals: an ethics-board submission, a notebook runtime, a patient-level extract, and a model-written analysis.

## Data flow

```
auditor session, purpose AUDIT
    |
    v
workspace, ethics status not-reviewed
    |
    v
stored population build for this organization
    |  missing, withheld, or a direct identifier => no dataset
    v
dataset version, insert only
    |
    v
export awaiting a different auditor
    approved => frozen payload
    declined => no payload
```

Organization comes from the session. The dataset does not update the chart or the population row.

## Proposed design
`POST /api/research/workspace`, `/snapshot`, `/export`, and `/decision`. Outbox events `research.workspace`, `research.dataset`, and `research.export` carry ids, a version, or a status. Audit actions use the `research.*` names.

## Security and privacy
A clinician cannot open the workspace. Another organization is not listed. The requester cannot approve. An approved export is the frozen count payload, scanned before the dataset was stored.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician opens a workspace | Role and purpose are checked first | Amira is forbidden |
| The requester approves the export | The approver must be a different auditor | Priya is forbidden. Nabil can approve |
| A dataset version is rewritten | Versions are inserted. A matching source hash returns the existing version | Version 1 stays after version 2 |
| A withheld population build is frozen | The snapshot is refused | A restricted tag blocks the next snapshot |
| A name is copied | The population payload is scanned before insert | The frozen payload has no Elena |
| Another organization is included | Queries filter the session organization | Evan is forbidden |

## Observability
`GET /api/health` reports schema version 18. Audit rows record workspace opens, snapshots, export requests, and decisions.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 18. That deletes local writes.

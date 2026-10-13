# RFC: Local residency

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An organization admin needs an explicit record that this deployment has one database file, and that a second region, an identity provider, and a customer key are not connected.

## Goals / non-goals
Goals: a residency pin of `local-sqlite`, a local read drill that does not claim a failover, and a session-only API grant.

Non-goals: SAML, SCIM, a customer key, a private network, a replica, and moving a tenant.

## Data flow

```
admin session, purpose OPERATIONS
    |
    v
residency pin local-sqlite, or refusal of any other name
    |
    v
federation not-connected, key not-configured
    |
    v
local health read
    elapsed time stored
    failover not-run
    |
    v
API grant local-session, scope health.read
moveTenant => refused
gateway explain => refused, pin unchanged
```

## Proposed design
`POST /api/enterprise/residency`, `/federation`, `/key`, `/drill`, `/grant`, `/explain`, and `/move`. The move route always refuses. Outbox events use the `enterprise.*` names. A refused move does not publish an event.

## Tenant movement
Stop the app. Copy `data/curasphere.sqlite` and its wal, shm, and journal files to a backup on this machine. Start the app on that same file. Do not point the file at another region. The product refuses `moveTenant`.

## Security and privacy
A clinician cannot open the page. An endpoint, a key byte string, and an external audience are refused and not stored. The drill does not copy patient rows.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician sets a region | Role must be admin | Amira is forbidden |
| A cloud region is stored | Only `local-sqlite` is accepted | `eu-central-1` is refused |
| An identity-provider URL is stored | A non-empty endpoint is refused | The HTTPS endpoint throws |
| Key material is stored | A non-empty material string is refused | The row stays not-configured |
| A drill is read as a failover | The failover column is `not-run` | The note says failover was not run |
| A tenant is moved | `moveTenant` throws and writes no residency change | The pin stays `local-sqlite` |

## Observability
`GET /api/health` reports schema version 23. A drill stores that version and the local read time. Audit rows record residency, federation, key, drill, grant, and refused move actions.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 23. That deletes local writes.

# RFC: Platform foundation slice

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, security, privacy, clinical safety (recorded for this local slice; not a regulated release)

## Problem
The specification pack had no runnable system. Clinicians need a workspace where source records, tenancy, and audit exist before any assistant is added.

## Goals / non-goals
Goals: server-derived tenant and facility, attributable access, append-only observations, versioned encounters, idempotent writes, an outbox written in the same transaction, a deterministic timeline, and a since-last-visit briefing that only restates source rows.

Non-goals: OIDC, consent, DSAR, retention automation, FHIR server, terminology service, AI gateway, agents, orders that leave the building, diagnosis, treatment advice.

## Intended users and intended use
See `docs/qms/intended-use-register.md`. This slice is clinical workflow support for a local synthetic record. It is not a medical device and not for real patients.

## Current workflow
There was no product. The seed represents a fictional morning at two health systems so isolation can be seen.

## Proposed design
Browser forms post to Next.js route handlers. Handlers load the session, then call the domain package. The domain ignores any organization or facility field in the body. SQLite enforces the transactional write. The timeline is computed on read from source tables.

```text
Browser --cookie--> Next.js route
                      |
                      v
                   Session row -> user, organization, facility, role, purpose
                      |
                      v
                   Domain transaction
                      |-- source table
                      |-- outbox
                      \-- audit_events
```

Trust boundary: the browser is untrusted. The database file is the trust zone for this slice. There is no second service.

## Data model and ownership
The domain package owns patients, encounters, conditions, allergies, medications, observations, appointments, sessions, audit, idempotency keys, and outbox. Source rows carry organization, facility, author, recorded time, and confidentiality. Observations are immutable. Encounters carry an integer version.

## APIs and events
Form posts: `/api/session`, `/api/session/end`, `/api/patients`, `/api/encounters`, `/api/encounters/complete`, `/api/observations`. Health: `GET /api/health`.

State-changing calls require `idempotencyKey`. Reuse with the same body returns the original result. Reuse with a different body conflicts.

Outbox event types: `patient.registered`, `encounter.opened`, `encounter.finished`, `observation.recorded`. Payloads carry identifiers and, for observations, the code. They do not copy the numeric result.

## Interoperability
Observation codes are a fixed LOINC allow-list. Condition codes in the seed are ICD-10-CM strings. There is no external FHIR exchange in this slice.

## Security threat model
Assets: synthetic PHI, session cookies, audit integrity.

| Threat | Mitigation | Residual |
| --- | --- | --- |
| Cross-tenant or cross-facility IDOR | Queries filter organization and facility from the session. Missing and foreign records both render as not on this facility. Audit outcome differs internally. | A role that can read PHI still sees every patient at that facility. |
| Forged tenant field | Not accepted on inputs. | None in this API. |
| Directory account takeover | No passwords; production flag refuses the directory. Cookie is httpOnly and SameSite=Lax. | Anyone who can open the dev server can choose an identity. |
| Audit tampering | Same database file as the chart. | A person with the file can edit rows. Immutable storage is later. |
| CSRF | SameSite=Lax withholds the cookie on cross-site POST. | A same-site attacker is out of scope for this slice. |
| Prompt injection | No model is called. | None until an assistant phase. |
| A stored operations comparison is read as a forecast or an order | The sentence names the counted rows and a confidence of none, low, or stored. A hold does not rewrite it. See `docs/rfc/RFC-0016-operations-intelligence.md`. | A reader can ignore the sentence. |
| An analytics query reads the chart | The mart is a separate table. Only an auditor can ingest or export it, and the export is counts. See `docs/rfc/RFC-0017-analytics-lakehouse.md`. | A person with the database file can join lineage back to the outbox. |
| A population cohort names a person | Counts below 5 are omitted, and a missing or restricted jurisdiction tag withholds the snapshot. See `docs/rfc/RFC-0018-population-intelligence.md`. | The tag is local configuration, not a statute. |
| A research export is treated as an ethics approval | The status stays not-reviewed, versions are insert-only, and the requester cannot approve. See `docs/rfc/RFC-0019-curaresearch.md`. | A reader can still treat the protocol label as an approval. |
| Study metadata is treated as an image | Pixel payloads are refused, and interpretation goes through the gateway refusal. See `docs/rfc/RFC-0020-imaging-dicom.md`. | A reader can still treat a modality as a completed read. |
| A device reading is treated as a live alarm | Connectivity stays not-connected, and the alert budget stops a fourth mark. See `docs/rfc/RFC-0021-devices.md`. | A reader can still treat the mark as a monitor alarm. |
| A recorded amount is treated as a collected payment | Status stays recorded, and a claim stays a draft. See `docs/rfc/RFC-0022-revenue.md`. | A reader can still treat the cents as money collected. |
| A signed evaluation promotes a model | The decision is a hold, and the promotion attempt stays not-promoted. See `docs/rfc/RFC-0023-evaluation.md`. | A reader can still treat a passed suite as permission to generate text. |
| A local pin is treated as another region | Only local-sqlite is stored, and failover stays not-run. See `docs/rfc/RFC-0024-enterprise.md`. | A reader can still treat the pin as a cloud region. |
| A listing is treated as an installed extension | Scope stays health.read, review is a hold, and release is refused. See `docs/rfc/RFC-0025-marketplace.md`. | A reader can still treat the listing as a running app. |
| A dossier is treated as regulatory clearance | The strategy stays not-approved and the attempt stays not-released. See `docs/rfc/RFC-0026-release-train.md`. | A reader can still treat the dossier as clearance to generate text. |
| One module card covers the others | Each code has its own intended use and model card, and a platform approval is refused. See `docs/rfc/RFC-0027-modules.md`. | A reader can still treat a not-cleared card as a diagnostic device. |

Tests cover cross-organization reads, cross-facility reads, auditor denial, idempotency, and version conflicts.

## Privacy impact
The slice stores fictional clinical data and access logs. Logs in the route handlers record failure codes, not names or result values. Real PHI must not be typed into the dev server. Consent, DSAR, and jurisdiction retention are not implemented. `retention_class` is recorded as `clinical-standard` and not enforced.

## Clinical hazards and mitigations
| Hazard | Mitigation |
| --- | --- |
| A threshold flag is read as a diagnosis | The flag text states the configured bound. The page says the briefing does not direct care. No orders are produced. |
| A briefing invents a fact | Briefing items are templates over source ids. Tests reject recommendation language. |
| Two writers finish one encounter | Version column. The loser gets a conflict and must reload. |
| A double submit duplicates a result | Idempotency key stored with the transaction. |

## AI/model considerations
None. No gateway call, no prompt, no generated prose.

## Reliability/SLOs
Local interactive use. Schema version is 1. Health returns that version.

## Capacity/cost model
One Node process and one SQLite file. Not a capacity claim.

## Migration/backward compatibility
`schema_migrations` version 1. Unknown versions refuse to open.

## Observability
Audit table is the access record. `GET /api/health` checks the schema. See `docs/runbooks/foundation.md`.

## Rollout
Local only. The synthetic banner stays on every page.

## Rollback
Stop the process and delete `data/curasphere.sqlite`. The next start reseeds. That destroys local writes.

## Test/validation plan
`npm test` for tenancy, briefing fidelity, idempotency, and conflicts. `npm run typecheck`. Manual pass: sign in as two facilities and confirm the other facility’s patient is absent.

## Alternatives
A mocked assistant was rejected. The pack forbids production mock behavior, and this slice has no model gateway.

## Open questions
When the Kotlin extraction starts, which service owns the outbox publisher.

## Decision
Accepted for the local foundation. Not a release to clinicians caring for real patients.

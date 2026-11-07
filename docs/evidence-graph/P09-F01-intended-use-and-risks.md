# P09-F01 intended use and risks

Intended user: current authorized care-team member using a synthetic patient in the local simulation. Intended use: record an explicitly unverified typed draft and retain its source-version provenance and append-only history. Author is server-bound to the current human principal; no model is invoked. No medical recommendation, risk score, diagnosis, treatment or care-gap determination is made. Conservative engineering risk C; qualified classification and clinical/privacy/security/architecture/licensing acceptance remain pending. Formal Phase 09 NOT_STARTED.

| Hazard | Control | Verification |
| --- | --- | --- |
| Unsupported claim appears clinically verified | SQL evidence_state CHECK allows unverified only; strict command rejects client status/author/model; amber unverified label | Direct SQL rejection and HTTP adversarial tests |
| Revoked or foreign source leaks through a draft | Live source inventory, owner/facility/purpose/coverage context, scope-bound fingerprint, content withheld on pointer drift | Tenant/patient/owner/coverage tests, source correction and UI clearing |
| A different principal saves an old page's claim | Context-bound source fingerprint plus server author; old fingerprint conflicts | Real doctor/nurse boundary tests |
| Unavailable service looks like no clinical findings | Source availability/integrity checked even for empty sources; 503 and cleared UI | Dependency-failure tests |
| Lost or overwritten history | Append-only tables, expected version, scoped idempotency and transactional receipt/outbox/audit | Independent process races, transaction-failure injection |
| Offline/cancel/late response shows cached assertions or resends writes | Abort/generation guards, hidden-page/network clearing, refresh-only recovery, no command queue | Browser failure/cancel/recovery cases |
| Unbounded retention or PHI logs | Local per-owner/patient and revision/source bounds; no new deletion policy; events carry IDs/versions, not text | Input bounds and outbox/audit inspection |

Residual: no clinical verification or external source/license completeness is established. Physical native devices, production multi-user throughput and formal qualified reviews are outside this local engineering evidence. Future sufficiency, ingestion and invalidation engines are separate features. Do not use graph drafts for clinical execution.

# Phase 02 security assurance packet

Review ID: P02-R02
Status: PENDING
Date prepared: 2026-10-14

Decision requested: ACCEPT, REQUEST CHANGES, or REJECT the security evidence for Phase 02 engineering, including the carried Phase 01 findings below. Acceptance here is not permission to deploy clinical break-glass.

## Controls submitted
Authentication: Dex RS256 ID tokens, PKCE, issuer, audience, and clock checks in `packages/domain/src/oidc.ts`. Refresh rotation and session revocation in `identity.ts`. TOTP lockout and passkey verification reuse those modules. `next.config.mjs` ignores `/api/auth/callback` in incoming request logs. The development directory requires `CURASPHERE_DEV_DIRECTORY=local-test` and is refused when `CURASPHERE_ENV` is production or staging.

Authorization: `authorize()` defaults to deny. An explicit deny overrides a grant. Cross-tenant and cross-facility checks fail closed. Self-assignment is denied. Role administration requires MFA assurance. A revoked assignment is read again on the next decision. Service principals cannot forward another user.

Workforce: invitation tokens are random, stored as SHA-256, and returned once. Email is not an identity key. The last organization administrator cannot be removed in the application. Suspension is organization-scoped. Offboarding the last organization revokes sessions. Events and the local outbox share the workforce transaction.

Emergency access: step-up uses `verifyUserTotp` or `finishPasskeyAuthentication`. Justification is required and is not copied into event reason codes. The grant stores principal, session, organization, facility, resource, and `synthetic.read`. Expiry is compared with server time on each check. The requester cannot dispose their own review. Production and staging disable the development policy.

## Findings and current exposure

| ID | Issue | What was checked on 2026-10-14 | Disposition requested |
| --- | --- | --- | --- |
| SEC-01 | A development log once contained an authorization code | `incomingRequests.ignore` includes `/api/auth/callback`. Later evidence says callback lines omit the query. This closeout did not replay a login to produce a new log line | Security reviewer accepts the ignore rule or requires a fresh log capture |
| SEC-02 | Phase 01 gateway image had Debian highs and two earlier critical base-image findings | No new Trivy image scan was run in this closeout. The last recorded scan remains `docs/platform/PHASE_01_COMPLETION.md` | Rescan before any image promotion. Owner: engineering role. Security reviewer accepts the carry-forward or blocks promotion |
| SEC-03 | Starlette CVEs on FastAPI 0.115.6 | `ai/gateway/requirements.txt` still pins `fastapi==0.115.6`. The installed environment was checked in this closeout and is recorded in the completion report | Owner: engineering role. Upgrade is outside Phase 02 identity scope. Security reviewer records whether the carry-forward blocks Phase 02 |
| SEC-04 | GitHub Actions and branch rules | Phase 01 created ruleset `25029633` while `main` had no GitHub commits, and `GITHUB_TOKEN` returned 401. This closeout queries `gh` again and records the result. No Actions run is claimed unless that command shows one | Owner: repository administrator. A hosted `verify` run is still absent unless the query shows otherwise |
| SEC-05 | Cosign local key versus hosted provenance | Phase 01 verified a local blob signature and did not upload a transparency log. This closeout did not create a new signature | Owner: engineering role. Not keyless GitHub provenance |
| SEC-06 | Local notification sandbox | Workforce and emergency outboxes store `captured`, `failed`, or `retried`. No external mail or paging provider is configured | Owner: operations role when one is assigned. Clinical use is blocked until a real channel and reviewer coverage exist |
| SEC-07 | Phase 03 audit, consent, and retention | Not implemented. Emergency events are the Phase 02 minimum and are not a FHIR AuditEvent endpoint | Owner: Phase 03. This gap stays visible. It is not closed by Phase 02 engineering acceptance |

npm audit results for the domain and web workspaces are in the completion report. They do not clear SEC-02 or SEC-03.

## If rejected
The failed control is remediated. Phase 02 is not marked accepted. Production deployment stays refused.

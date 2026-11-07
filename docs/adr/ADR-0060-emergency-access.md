# ADR-0060: Synthetic emergency access inside authorize()

Status: Accepted as an engineering record
Date: 2026-10-14

## Context
Phase 02 feature 5 requires a temporary, reviewed exception for a missing care relationship. Authentication, sessions, `authorize()`, organization and facility membership, TOTP, passkeys, and the local notice outbox already exist. A second authorization engine, a Boolean on the user, or a client `emergency` flag would bypass those controls.

`authorize()` already denies `context.emergency` with `emergency-disabled`. That denial stays. A client flag is not a grant.

Ama Mensah remains an organization administrator. She is not the clinician in this scenario. Kwame Boateng (`usr_gh_doctor`) is the synthetic clinician. Esi Boateng (`usr_gh_reviewer`) is the independent auditor. Kojo Agyeman is an isolated synthetic record, `syn_kojo_agyeman`, and is not the laboratory user Kojo Mensah.

## Decision
Chart schema 32 adds emergency policy, resource, request, challenge, grant, event, review, alert, and control tables. Foundation Flyway stays at version 16. There is no `isEmergency` column on `users`.

The only enabled policy is `pol_demo_gh_synthetic`, environment `development`, organization `org_demo_gh`, facility `fac_gh_accra`, resource type `SyntheticRestrictedRecord`, action `synthetic.read`, overridable reason `relationship-required`. `CURASPHERE_ENV` of `production` or `staging` disables eligibility and grant use. Real clinical types stay denied. Tests do not enable a production policy.

A request moves `challenge_required` to `authorized` only after `verifyUserTotp` or `finishPasskeyAuthentication`. `activateEmergency` then rechecks eligibility, reviewer coverage, and a 5 minute freshness window. The grant, the grant event, the review case, and the local alert are one transaction. A thrown commit failure rolls the grant back. The grant is bound to the principal, session, organization, facility, resource, and `synthetic.read`. The engineering duration cap is 15 minutes. That cap is not an approved clinical policy.

`authorize()` may turn a `relationship-required` or `permission` denial into `emergency-grant` only when the grant lookup matches. Confidentiality, tenant, facility, session, account, purpose, bulk export, prescribing, dispensing, clinical signing, billing adjustment, and laboratory authorization stay denied. Expiry is compared with server time on every check. Logout calls `revokeEmergencyForSession`.

Review permissions `emergency.review.read`, `emergency.review.assign`, `emergency.review.disposition`, `emergency.review.escalate`, and `emergency.grant.revoke` are on the auditor role only. Organization administrators do not receive them. The requester cannot dispose their own review. The reviewer does not gain `synthetic.read` by opening the case. Alerts use channel `local-sandbox`. A captured row is not external delivery. Missing reviewer coverage blocks the grant.

Events store a reason code, not the free-text justification. The shape can later map to FHIR R4 AuditEvent. This phase does not add that endpoint. Phase 03 remains the broader audit, consent, privacy, and retention boundary.

## Threat model
Forged flags, forged grant bodies, and browser clocks are ignored. Session binding stops a copied grant from another session. Resource and action columns stop reuse against another record or a clinical action. Cross-organization and cross-facility lookups fail. Replay of a consumed step-up or a stale freshness window does not activate a grant. A failed authenticator leaves the request at `challenge_required`. Review updates use the version column. Events are insert-only in this feature. Routes reject a foreign `Origin`. Ineligible callers receive the same unavailable response, without a statement that a hidden record exists. Production and staging cannot activate the development policy.

## Consequences
The emergency navigation entry appears only for `emergency.request` or `emergency.review.read`. No architecture, security, or clinical reviewer has signed this decision. Production clinical break-glass stays disabled.

## Revisit trigger
A formally approved policy would be required before any non-synthetic resource, any cross-organization exception, or any production environment enablement. Do not start Phase 03 from this decision.

# Emergency access

Break-glass in this phase is a development-only, read-only exception for one synthetic record. It is not a universal bypass and it is not enabled for clinical records.

## Policy

Hard denials that a grant cannot override:

- Invalid, expired, or revoked authentication and sessions
- Disabled accounts and suspended or revoked memberships
- Missing `emergency.request` on the requester
- Service identities and client-supplied emergency flags
- Another organization or an unapproved facility
- Confidential or restricted classification
- Prescribing, dispensing, clinical signing, laboratory authorization, billing adjustment, bulk export, role administration, and tenant administration
- `CURASPHERE_ENV` of `production` or `staging`

The only overridable denial is `relationship-required` or `permission` for `SyntheticRestrictedRecord` / `synthetic.read` under policy `pol_demo_gh_synthetic` version 1 at Accra Central Medical Centre in `DEMO_GH`. The record id is `syn_kojo_agyeman`. Its text says it is not a diagnosis, a treatment recommendation, or a clinical chart.

The proposed freshness window is 5 minutes. The proposed maximum grant is 15 minutes. Both are engineering values, not an approved production clinical policy.

## State machine

Request: `challenge_required` → `authorized` → `active`, or `denied`, `cancelled`, `expired`, `revoked`, `failed`.

Review, stored separately: `pending_review` → `in_review` → `closed_appropriate`, `closed_inappropriate`, or `escalated`.

A reason, a challenge, or a closed review does not grant or restore access. A denied request is not reopened by editing status. Closing a review does not delete events.

## Step-up

TOTP uses `verifyUserTotp` on the enrolled authenticator. Passkey uses `beginPasskeyAuthentication` and `finishPasskeyAuthentication`. The browser cannot send `mfaCompleted`. A failed or replayed challenge does not create a grant.

## API

- `GET /api/emergency-access/eligibility`
- `POST /api/emergency-access/requests`
- `POST /api/emergency-access/requests/{id}/verify`
- `POST /api/emergency-access/requests/{id}/passkey`
- `POST /api/emergency-access/requests/{id}/activate`
- `GET /api/emergency-access/current`
- `POST /api/emergency-access/grants/{id}/revoke`
- `GET /api/emergency-access/history`
- `GET /api/emergency-access/reviews`
- `GET /api/emergency-access/reviews/{id}`
- `POST /api/emergency-access/reviews/{id}/assign`
- `POST /api/emergency-access/reviews/{id}/disposition`
- `POST /api/emergency-access/reviews/{id}/escalate`

The client does not choose the resource id. The server uses `syn_kojo_agyeman`. Mutating routes reject a foreign `Origin`.

## Evidence

`emergency_events` is append-only from these services. Grant creation, the grant event, `emergency_reviews`, and `emergency_alerts` commit together. Alert status is `captured`, `failed`, or `retried` on channel `local-sandbox`. Event fields are actor, type, time, decision, resource id, action, outcome, reason code, policy version, and correlation id. They do not copy the justification. A later AuditEvent mapping can use those fields. No FHIR AuditEvent endpoint is provided in Phase 02.

## Screens

Restricted access, justification, identity verification, active banner, ended, requester history, and the reviewer queue. The active banner is `Emergency Access Active` and includes scope, remaining time, expiry, request reference, and End Emergency Access. The countdown is informational. The server compares `expires_at` on each read. Ending access, expiry, or a failed current-grant check clears the record from the page.

## Review

Esi Boateng holds the auditor review permissions. Kwame cannot close his own review. Organization administrators do not inherit review permissions. If control `reviewer` is `missing`, grants are blocked.

## Operations

Counts belong on event type and reason code, not on a patient identifier or the justification. Local signals are request created, denied, step-up failed, grant created, grant expired, grant revoked, resource accessed, review pending, and alert failed.

Runbooks, without named on-call staff:

1. Policy misconfiguration: confirm `emergency_policies.status` and `CURASPHERE_ENV`. Disable the row to stop new grants. Existing grants fail the policy join.
2. Unauthorized access: revoke the grant id. Confirm the session id and membership. Preserve events.
3. Identity-provider or authenticator outage: step-up fails closed. Do not mark a challenge successful.
4. Database outage: authorization fails closed with `policy-unavailable`. Do not issue a grant outside the transaction.
5. Missing audit evidence: a grant without a review row is a failed transaction. Stop new activations and compare `emergency_grants` with `emergency_reviews`.
6. Reviewer unavailable: set the operational blocker. Do not leave `reviewer` empty in a clinical environment. This phase has no clinical enablement.
7. Alert failure: `delivery=fail` stores `failed`. Restore `sandbox` and call `retryEmergencyAlert`. This does not send an external message.
8. Revocation: the principal or an auditor with `emergency.grant.revoke` posts the revoke route. The next protected read is denied.
9. Credential compromise: revoke the session, which revokes session-bound grants, and revoke the authenticator through the existing identity functions.
10. Failed deployment: chart schema 32 tables are additive. An older application that does not know the tables can still open the file. Do not delete `data/curasphere.sqlite` to roll back. Foundation Flyway is unchanged.

## Rollback

Upgrade from schema 31 runs `UPGRADE_V32` and records version 32. `CREATE TABLE IF NOT EXISTS` makes a repeated upgrade safe. Removing the feature code leaves the tables in place. Do not drop them as part of an application rollback.

# ADR-0059: Workforce lifecycle on existing memberships

Status: Accepted as an engineering record
Date: 2026-10-14

## Context
Phase 02 feature 4 requires invite, accept, deactivate, transfer, and role and facility assignment, with revocation that takes effect in an existing session. Identity, organization membership, facility membership, Dex linking, sessions, and `authorize()` already exist. A second workforce identity store would split those records.

ADR-0058 denied `workforce.invite` because the action was not implemented. That denial is superseded for this action only. `clinical.sign`, prescribing, dispensing, laboratory authorization, billing adjustment, emergency elevation, and export remain denied.

Ama Mensah (`usr_gh_admin`) is an organization administrator. She could open Revenue and Audit because that role had been given `billing.read` and `security.audit.read` to preserve older `users.role = admin` shortcuts. Those two grants are broader than workforce administration. The correction is recorded in `docs/identity/P02-F04-privilege-correction.md`. P02-F03 evidence is unchanged.

## Decision
Workforce administration extends chart memberships. Chart schema 31 adds `account_status` on `users` and the tables `workforce_invitations`, `workforce_invitation_facilities`, `workforce_events`, `workforce_outbox`, and `workforce_controls`. Foundation Flyway stays at version 16.

Invitation status is `pending`, `accepted`, `expired`, or `cancelled`. Membership status stays `active`, `suspended`, or `revoked`. Reactivation is the transition from `suspended` to `active`, recorded as an event, not a stored status. A global `account_status` of `disabled` is separate from an organization suspension and from a facility revocation.

The invitation token is 32 random bytes, returned once to the caller, and stored as a SHA-256 hash. The outbox records `captured`, `failed`, or `retried`. It does not store the token. There is no external mail provider. A captured row is a local sandbox, not proof of delivery. Acceptance requires the token hash and the authenticated user id. `requires_external` also requires an active `external_identities` row for that same user id. Email text is not used to find or merge a user.

Organization administrators see every active facility in their organization. Facility administrators see only their active facility memberships. A facility-scoped suspend uses `workforce.update`. Organization suspend, offboarding, and privileged role changes use `workforce.suspend` or `security.role.manage`. Privileged role assignment also requires assurance `mfa`. A person cannot assign a role to their own session. The last active organization administrator cannot be suspended, offboarded, or revoked. Recovery is a recorded local procedure. This feature does not add an in-app bypass.

Role and membership changes delete `authorization_cache` rows for that principal. A transfer revokes the source facility membership and its facility role assignments, opens the destination, and clears a session whose active facility is the source. Offboarding one organization does not revoke sessions when another organization membership is still active. Offboarding the last organization revokes sessions.

Mutating workforce routes reject a foreign `Origin`. Same-site forms keep the existing `SameSite=lax` session cookie.

## Consequences
Navigation shows Workforce only when `workforce.read` is allowed. The pages call the same services as the API. Proposed clinical permissions remain unapproved. No architecture, security, or clinical reviewer has signed this decision.

## Revisit trigger
Add a real mail transport only behind an adapter that still stores hashes, not tokens. Do not start P02-F05 from this decision.

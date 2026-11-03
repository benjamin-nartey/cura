# Workforce management

Chart schema 31. Policy `p02-rbac-2026.10` version 1. ADR-0059.

## Lifecycle
An identity can have many organization memberships and many facility memberships. Roles are assignments at a facility. Invitation status is separate from membership status.

| Condition | Stored state | Effect |
| --- | --- | --- |
| Invitation sent | `workforce_invitations.status = pending` | No access |
| Invitation accepted | `accepted`, memberships `active` | Access only after the token and identity binding succeed |
| Invitation expired or cancelled | `expired` or `cancelled` | Acceptance is rejected |
| Facility suspended | `facility_memberships.status = suspended` | That facility denies. Other memberships stay |
| Organization suspended | `organization_memberships.status = suspended` | That organization denies. Another organization stays |
| Facility or organization revoked | `revoked` | That scope never grants |
| Account disabled | `users.account_status = disabled` | Every action for that user denies |
| Reactivation | suspended row returns to `active` | Revoked role assignments are not restored |

## Invitation contract
Create, list, resend, cancel, and accept. The token is returned once. Storage keeps `token_hash`. Replay of the same idempotency key returns the existing id and a null token. A second accept conflicts. Rate limit is 20 invitations per actor per hour. Privileged roles cannot be placed on an invitation. Expiry is 7 days.

Acceptance looks up the hash, checks status and expiry, and requires `externalLinked` when `requires_external` is set. The bound user is the authenticated user id. Two external identities with the same email stay distinct.

The outbox is a local sandbox. `captured` means the notice was recorded locally. `failed` means the mail control was down. Resend after the control is cleared writes `retried`. None of these states means an external mailbox received the message.

## Membership and roles
`workforce.read` lists and reads within the actor's facilities. `workforce.invite` creates and cancels invitations. `workforce.update` transfers, adds a facility, and suspends or reactivates a facility membership. `workforce.suspend` suspends an organization or offboards. `workforce.assign-role` assigns a non-privileged role. `security.role.manage` plus assurance `mfa` assigns or revokes a privileged role.

Assignable invitation roles are nurse, doctor, receptionist, laboratory scientist, and billing officer. The form does not preselect an administrator role.

The last organization administrator cannot be removed. There is no in-app recovery. A recorded local procedure must restore an administrator assignment in the chart database.

## API
Pages post forms. JSON `GET /api/workforce` and `GET /api/workforce/{id}` return the same scoped records.

| Method | Path | Action |
| --- | --- | --- |
| GET | `/api/workforce` | Directory |
| POST | `/api/workforce/invitations` | Create invitation |
| GET | `/api/workforce/invitations` | List invitations |
| POST | `/api/workforce/invitations/{id}` | `resend`, `cancel`, or `accept` |
| POST | `/api/workforce/invitations/accept` | Accept with the signed-in user |
| GET | `/api/workforce/{id}` | Profile and history |
| POST | `/api/workforce/{id}` | `role`, `revoke-role`, `add-facility`, `transfer`, `suspend`, `reactivate`, `revoke` |

A foreign `Origin` is rejected. Stale `version` returns a conflict. Errors do not include tokens or guessed tenant ids.

## UI routes
`/workforce`, `/workforce/invite`, `/workforce/invitations`, `/workforce/accept`, `/workforce/activity`, `/workforce/{id}`, `/workforce/{id}/access`, `/workforce/{id}/transfer`, `/workforce/{id}/status`, `/workforce/{id}/offboard`.

Success text is shown only after the redirect that follows a committed write. A conflict asks the reader to refresh.

## Migration and rollback
Upgrade from schema 30 adds `users.account_status` and the workforce tables, then sets version 31. Fresh databases create version 31 directly. The upgrade is one transaction in `migrate`. If it fails, the version stays 30 and the next open retries.

Rollback of the feature is to stop serving the workforce routes and leave schema 31 in place. Dropping the tables would remove invitation and event history, so it is not the recovery path. Restoring access after a bad offboard is a new authorized assignment, not a delete of `workforce_events`.

## Threats
Cross-tenant and unknown facility ids return the same not-found text. Facility administrators do not receive rows outside their facilities. Self-assignment is denied. Invitation guesses fail the hash lookup. Tokens are not written to the outbox or events. Logs for unexpected failures use the fixed text `unexpected_write_failure`. A facility administrator cannot set `account_status`. Session cache rows are deleted on role and membership changes.

## Observability and recovery
Events use a `wf_` correlation id and policy version. Controls `workforce_controls.idp=down` and `mail=down` fail closed for accept and local delivery. Clear the control and retry. A transfer that fails the facility check does not change the source membership. A version conflict leaves the previous row. Permission invalidation is the cache delete in the same transaction as the assignment change. If that delete did not run, the assignment version still will not match a stale cache row.

Identity-provider downtime: do not accept invitations until `idp` is not `down`. Database write failure: the transaction rolls back. Notification failure: the invitation stays pending and resend is safe. Interrupted transfer: rerun only after reading the current facility versions. Replayed requests with the same idempotency key do not create a second invitation.

## Scenarios
P02-S63 through P02-S92, P02-S94 through P02-S96, and P02-S98 are domain tests in `packages/domain/test/workforce.test.ts`. P02-S93 and P02-S97 are browser checks: a denied or expired session, and a facility change that is read again from the server so the previous facility is not kept as the active membership.

# P02-F04 privilege correction

Date: 2026-10-14

P02-F03 evidence is not changed by this note.

## What was observed
Ama Mensah (`usr_gh_admin`) is the DEMO_GH organization administrator. She is not a clinician. After P02-F03 she could open Revenue and Audit. The organization-administrator role included `billing.read` and `security.audit.read` so the older `users.role = admin` shortcuts kept working. That was a privilege expansion beyond workforce and organization administration.

## Correction
`seedAuthorization` deletes those two role permissions for `organization-administrator`. Billing remains on `billing-officer`. Audit remains on `auditor`. The delete removes grants. It does not add any permission. Default deny is unchanged.

Harborlight `usr_admin` is also mapped to organization-administrator and loses the same two permissions. Domain revenue tests that call `readRevenue` with `ctx.role = admin` do not call `authorize()`. The web revenue page does call `authorize()` for `billing.read`, so an organization administrator no longer opens it.

Clinical role permissions stay proposed. This correction does not approve them.

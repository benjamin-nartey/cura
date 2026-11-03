# P02-F04 evidence

Date: 2026-10-14

Engineering record only. Approvals are empty. This is not a certification, a medical-device authorization, or an approved clinical policy.

## What was checked
Chart schema 31 adds workforce invitations, invitation facilities, events, a local outbox, and controls, plus `users.account_status`. Foundation Flyway was not changed.

`npm run typecheck --workspace @curasphere/domain` exited 0. `npm run typecheck --workspace @curasphere/web` exited 0. `npm test --workspace @curasphere/domain` exited 0 with 161 passed and 0 failed, including P02-F01 through P02-F03 regressions and P02-S63 through P02-S92, P02-S94, P02-S95, P02-S96, and P02-S98. After the suspended-membership navigation filter, `test/authorization.test.ts` and `test/workforce.test.ts` together exited 0 with 58 passed and 0 failed. `npm audit` for `@curasphere/domain` and `@curasphere/web` each reported 0 vulnerabilities.

## Privilege correction
Ama Mensah could open Revenue and Audit because organization-administrator included `billing.read` and `security.audit.read`. Those two grants were removed. See `docs/identity/P02-F04-privilege-correction.md`. P02-F03 evidence was not edited. In the browser, Ama's navigation showed Workforce and did not show Revenue or Audit.

## Browser
Local Next.js on port 3000 and the foundation directory.

- Ama Mensah opened `/workforce`, saw DEMO_GH staff, and did not see DEMO_EU names. She invited `efua.mensah@demo-gh.invalid` as a nurse at Accra Central Medical Centre. The invitation was pending. The local sandbox showed a one-time copy. That copy is not external mail delivery.
- Efua Mensah signed in through the directory. Her chart user already had an external identity row. She accepted the invitation. The invitation row became `accepted` with `bound_user_id = usr_gh_invite`. Her Accra facility membership became `active` with role `nurse`. After her foundation facility was set to Accra and she signed in again, `/patients` opened for Accra Central Medical Centre.
- Kofi Boateng, facility administrator at Accra, saw only Accra in the facility filter. Yaa Asare and Kojo Mensah were absent. A forged European facility id rendered "This page is not on the workspace."
- Yaa Asare opened `/workforce` and received "This area is not available." Workforce was not in her navigation.
- Efua's Accra membership was suspended. `/patients` then denied her, and the clinical navigation links were removed. The membership was reactivated to `active` at version 3 so the invitee was not left suspended.
- Adwoa Sarpong was offboarded from DEMO_GH. A new directory sign-in still reached `/patients` as denied, with no clinical navigation. The synthetic membership and role assignment were then set back to active so the demo directory is not left revoked. The offboard event remains.

Directory sign-in was used for these personas. A live Dex redirect was not repeated in this browser pass. Domain S67 accepts only when `externalLinked` is true, which is the same `external_identities` row Dex writes. S68 rejects a user without that row.

## Not claimed
No reviewer signed. Clinical role permissions remain proposed. The outbox does not prove external email. P02-F05 and Phase 03 were not started. Emergency elevation stays denied.

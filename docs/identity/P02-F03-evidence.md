# P02-F03 evidence

Date: 2026-10-14
Status: ACCEPTED as an engineering record. Phase 02 remains in progress. Approvals are empty.

## Architecture

`authorize(subject, action, resource, context)` in `packages/domain/src/authorization.ts` is the only new policy decision point. Default is deny. Role grants come from assignments. A matching deny policy overrides a grant. The browser reads the same permissions for navigation and does not grant access.

Foundation schema 15, Flyway V16, and chart schema 29 are separate histories. Authorization is chart schema 30. No foundation Flyway migration was added. A live cache table created during development with `principal_id` is rebuilt to `cache_key` on seed. Fresh databases create `cache_key` directly.

## Scenarios

| ID | Actor | Expected | Result |
| --- | --- | --- | --- |
| P02-S37 | Ama Mensah, DEMO_GH, Accra, organization administrator | Allow `organization.read` | Pass. HTTP access API lists that permission. |
| P02-S38 | Yaa Asare, East Legon, receptionist | Deny `security.role.manage` | Pass. Reason `permission`, HTTP 403. |
| P02-S39 | Kwame Boateng, Accra, doctor | Allow `clinical.read` on a standard resource | Pass. Browser opened `/patients` for Accra. |
| P02-S40 | Akosua Owusu, nurse | Deny `security.role.manage` | Pass. Reason `permission`. |
| P02-S41 | Kojo Mensah, Madina, laboratory scientist | Deny `billing.adjust` | Pass. Reason `unimplemented`. |
| P02-S42 | Yaa Asare | Deny Accra while active at East Legon | Pass. Reason `facility`. |
| P02-S43 | Akosua Owusu | East Legon after switch, Madina denied | Pass. Live switch returned East Legon Family Clinic. |
| P02-S44 | Kwame Boateng guesses DEMO_EU | Deny, no guessed id stored | Pass. HTTP 404 `That record is not available.` |
| P02-S45 | Yaa Asare | Forged role does not grant | Pass. |
| P02-S46 | Ama Mensah | Self-assignment denied | Pass. |
| P02-S47 | Ama Mensah | Revoked role stops in the same session | Pass. After revocation, `/revenue` redirected to `/access/denied` and `/api/access` returned no roles. The assignment was restored. |
| P02-S48 | Kwame Boateng | Explicit deny overrides `medication.read` | Pass. Reason `deny-override`. |
| P02-S49 | Kwame Boateng, purpose RESEARCH | Deny | Pass. Reason `purpose-denied`. |
| P02-S50 | Ama Mensah, password assurance | Deny `security.role.manage` | Pass. Reason `assurance-required`. |
| P02-S51 | Kwame Boateng, confidential resource | Deny | Pass. Reason `confidential`. |
| P02-S52 | Ama Mensah, bulk | Deny | Pass. Reason `bulk`. |
| P02-S53 | `svc_gh_sync` forwarding a European user | Deny | Pass. Reason `delegation`. Clinical read also denied. |
| P02-S54 | Policy dependency unavailable | Deny | Pass. Reason `policy-unavailable`. |
| P02-S55 | Two assignment writes, same version | Second conflicts | Pass. |
| P02-S56 | Stale cache after revocation | Deny | Pass. |
| P02-S57 | Yaa Asare denial | Decision row without a guessed id | Pass. |
| P02-S58 | Facility switch refreshes scope | East Legon active, UI follows permissions | Pass. HTTP switch notice `switched`. |
| P02-S59 | Direct navigation | Hidden route denied | Pass. Yaa and Ama opening `/patients`, and Kwame opening `/revenue`, landed on `/access/denied`. |
| P02-S60 | Reopen the database file | Organization manage still allowed | Pass. |
| P02-S61 | `clinical.sign` | Deny | Pass. Reason `unimplemented`. |
| P02-S62 | Emergency context | Deny | Pass. Reason `emergency-disabled`. |

Missing classification and a required patient relationship without an assigned synthetic fixture also deny. An assigned fixture allows the doctor read. One hundred evaluations completed inside a test whose total duration was 160 ms. The selected target was under 5 seconds for those 100 decisions.

## Browser

Yaa Asare signed in at East Legon. Navigation showed Dashboard, Organization, Access, and Gateway. `/patients` showed "This area is not available." Her access page listed receptionist, `facility.read`, `facility.switch`, and `organization.read`.

Ama Mensah signed in at Accra. Navigation included Revenue, Audit, and Organization, and did not include Patients. `/patients` showed the same unavailable page.

Kwame Boateng signed in at Accra. `/patients` showed the Accra list and "No patient on this facility matches." `/revenue` showed the unavailable page. No European facility name was shown.

## Commands

- `npm run typecheck --workspace @curasphere/domain` exit 0
- `npm run typecheck --workspace @curasphere/web` exit 0
- `npm test --workspace @curasphere/domain` exit 0. 128 passed, 0 failed. This includes the previous tenancy and identity tests.
- `npm audit --workspace @curasphere/domain` exit 0. 0 vulnerabilities.
- `npm audit --workspace @curasphere/web` exit 0. 0 vulnerabilities.

## Boundaries

Proposed clinical permissions are not an approved clinical policy. No architecture, security, or clinical reviewer has signed. Phase 03 audit, consent, and privacy controls are not implemented. Emergency elevation is not implemented. P02-F04 was not started.

The development directory remains available only when `CURASPHERE_DEV_DIRECTORY=local-test` and the environment is neither staging nor production. Staging and production refuse it even if the flag is set. One earlier development log contained an authorization code before the callback ignore rule. Later callback lines do not include the query. The code is not recorded here.

# Phase 02 traceability

Date: 2026-10-14

Historical feature evidence files are unchanged. This matrix points at them. The closeout regression command is recorded in `docs/identity/PHASE_02_COMPLETION.md` after it finishes.

| Requirement | Feature | Implementation | Tests | Engineering record |
| --- | --- | --- | --- | --- |
| Server-resolved organization and facility; client tenant id denied | P02-F01 | `packages/domain/src/tenancy.ts`, foundation Flyway V16, chart memberships | P02-S01–S09 | `docs/identity/P02-F01-evidence.md`, ADR-0056 |
| OIDC, PKCE, issuer and audience checks, refresh, MFA, passkeys | P02-F02 | `packages/domain/src/oidc.ts`, `identity.ts`, `webauthn.ts`, `apps/web` auth routes | P02-S10–S36 | `docs/identity/P02-F02-evidence.md`, ADR-0057 |
| Default-deny RBAC and ABAC in one `authorize()` | P02-F03 | `packages/domain/src/authorization.ts` | P02-S37–S62 | `docs/identity/P02-F03-evidence.md`, ADR-0058 |
| Cross-tenant isolation | P02-F01, P02-F03 | Tenant mismatch returns a generic denial and does not store the guessed id | P02-S44 | P02-F01 and P02-F03 evidence |
| Privilege escalation denied | P02-F03, P02-F04 | Self-assignment denied. Privileged roles need MFA. Last organization administrator cannot be removed | P02-S45, P02-S46, P02-S50, P02-S96 | P02-F03 and P02-F04 evidence |
| Access decisions recorded | P02-F03, P02-F05 | `authorization_decisions`, `workforce_events`, `emergency_events` | P02-S57, P02-S126, P02-S127 | P02-F03 and P02-F05 evidence |
| Workforce invite, bind, suspend, transfer, offboard | P02-F04 | `packages/domain/src/workforce.ts`, `apps/web/app/workforce` | P02-S63–S92, S94–S96, S98 | `docs/identity/P02-F04-evidence.md`, ADR-0059 |
| Organization administrator loses billing and audit reads | P02-F04 correction | `seedAuthorization` deletes `billing.read` and `security.audit.read` from that role | Covered by the privilege note and later domain runs | `docs/identity/P02-F04-privilege-correction.md` |
| Break-glass reason, scope, time box, re-authentication, alert, review | P02-F05 | `packages/domain/src/emergency.ts`, `apps/web/app/emergency` | P02-S99–S142 | `docs/identity/P02-F05-evidence.md`, ADR-0060 |
| Production and staging clinical break-glass disabled | P02-F05 | `CURASPHERE_ENV` of production or staging fails eligibility | P02-S142 | P02-F05 evidence |
| Deactivated staff lose access in the current session | P02-F04 | Membership status feeds `effectivePermissions` and session revocation on last-organization offboard | P02-S80 and related workforce tests | P02-F04 evidence |

Original Phase 02 exit criteria remain mandatory. Engineering evidence exists for each. The phase register still marks them pending because a reviewer has not accepted that evidence. Feature engineering status is ACCEPTED. Phase status is not.

# ADR-0058: Chart-database RBAC and ABAC with a single decision function

Status: Accepted as an engineering record
Date: 2026-10-14

## Context
P02-F01 keeps the active organization and facility on the server session. P02-F02 binds that session to a verified identity. Protected reads still used scattered role checks (`clinician`, `nurse`, `auditor`, `admin`). Phase 02 requires one policy decision that also considers facility, purpose, confidentiality, relationship, and jurisdiction, and that fails closed.

Foundation Flyway version 16 writes `foundation_meta.schema_version` 15. That off-by-one is historical and is a different database from the chart SQLite file. Chart schema 29 is the identity migration. These are separate version sequences. Authorization uses the chart database because memberships and sessions already live there. It does not add a foundation Flyway migration.

The development directory previously refused sign-in only when `CURASPHERE_ENV` was `production`. Staging could still open it.

## Decision
`authorize(subject, action, resource, context)` in `packages/domain/src/authorization.ts` is the policy decision point. The default is deny. Role grants come from versioned assignments. An active policy row whose conditions name the same principal and action denies even when a role grants that action. Wildcard actions, unimplemented clinical signature, prescribing, dispensing, laboratory authorization, billing adjustment, workforce invite, bulk reads, and export actions are denied. `RESEARCH` and any purpose outside the approved set are denied. Confidential or restricted resources are denied. A clinical read with no sensitivity classification is denied. A required patient relationship is denied unless the caller passes an assigned relationship from a synthetic fixture. Emergency context is always denied until P02-F05. A policy-store dependency value other than `available` denies every protected action.

The authenticated principal is the only subject. Client role names, permission arrays, and `X-Organization-Id` are not inputs. A forwarded user id that differs from the service principal is a delegation denial. Cross-tenant denials are recorded without the guessed organization id. Object-shaped cross-tenant denials map to HTTP 404. Other denials map to 403. A missing session maps to 401.

Assignments are cached with the sum of active assignment versions. Revocation increments the version and deletes the cache. A cache row from an older version cannot allow the revoked permission. Assignment updates compare `expectedVersion` and return a conflict when it does not match. A principal cannot assign a role to themselves. `security.role.manage` also requires assurance `mfa`.

Chart schema 30 adds `authorization_roles`, `authorization_permissions`, `authorization_role_permissions`, `authorization_assignments`, `authorization_policies`, `authorization_decisions`, `authorization_controls`, and `authorization_cache`. A database at 29 applies only this upgrade. Fresh databases insert version 30. The upgrade runs inside the existing migrate transaction.

Local directory sign-in now requires `CURASPHERE_DEV_DIRECTORY=local-test` and is refused when `CURASPHERE_ENV` is `staging` or `production`, including when the flag is set. The Next.js development config sets the flag only when the environment is neither of those.

Navigation reads `effectivePermissions`. It does not grant access. `/patients` and `/revenue` call `authorize` before rendering records. `/access` shows only the current principal. `/access/diagnose` exists only while the local directory flag is enabled.

Proposed clinical permissions for doctor, nurse, pharmacist, and laboratory scientist are not an approved clinical policy. `clinical.sign` stays denied. Auditor remains because the product already uses that role. Platform administrator, facility administrator, pharmacist, billing officer, and patient exist in the catalogue and are not granted clinical records by default.

## Consequences
Existing `canReadChart` checks remain for modules that are not on this boundary. New protected routes must call `authorize`. Phase 03 still owns the full audit, consent, and privacy domain. `authorization_decisions` is the minimum Phase 02 evidence and is not that domain. No architecture, security, or clinical reviewer has signed this decision. It is not a certification or a medical-device authorization.

## Revisit trigger
Replace the chart policy tables with a foundation-owned store if a later feature requires one authorization database. Enable emergency elevation only in P02-F05 after that workflow is accepted. Do not treat the proposed clinical matrix as approved policy.

# Authorization

P02-F03 evaluates access with one server function, `authorize(subject, action, resource, context)`. The browser does not decide. A hidden menu item is only a usability hint.

## Decision

The subject is the authenticated user or service principal, with an active account and a valid session. The action is a catalogue permission such as `organization.read`. The resource carries a type, an owning organization, an owning facility, a sensitivity, and an optional relationship requirement. The context carries the server purpose, the active facility, authentication assurance, policy version, and whether emergency elevation was requested.

Deny is the default. A matching deny policy overrides a role grant. These purposes are accepted only together with a grant: `TREATMENT`, `OPERATIONS`, `PAYMENT`, `ADMINISTRATION`, `AUDIT`, and `PATIENT`. `RESEARCH` is denied. Purpose alone never grants access.

A resource in another organization is denied. The decision row does not store that organization id. A facility resource is denied when the principal has no active membership there, or when it is not the active facility. Switching facility uses the existing tenancy flow and then the new facility's grants. Membership in two facilities does not include a third.

`security.role.manage` requires assurance `mfa`. Confidential and restricted resources are denied. A clinical action with no classification is denied. A required patient relationship is denied unless a synthetic fixture says the relationship is assigned. This fixture is not an encounter and does not create a treatment relationship. Emergency access is denied until P02-F05.

If `authorization_controls.dependency` is not `available`, every decision is deny. Evaluation errors are deny.

## Catalogue

System roles are platform administrator, organization administrator, facility administrator, doctor, nurse, pharmacist, laboratory scientist, receptionist, billing officer, patient, service principal, and the existing auditor role. Membership text maps onto those roles. `users.role` stays limited to clinician, nurse, auditor, and admin.

| Role | Allowed examples | Not granted |
| --- | --- | --- |
| Platform administrator | `organization.read`, `security.policy.read` | Clinical records |
| Organization administrator | Organization, facility, workforce read, role administration with MFA, billing read | `clinical.read`, `billing.adjust` |
| Facility administrator | Facility management inside assigned facilities | Clinical records, other facilities |
| Doctor | Clinical read, create, and update; medication read; laboratory read | `clinical.sign`, confidential records, prescribing |
| Nurse | Clinical read and update; medication read | Role administration, prescribing |
| Pharmacist | `medication.read` | Prescribing, dispensing, clinical records |
| Laboratory scientist | Laboratory order and result read | `billing.adjust`, result authorization |
| Receptionist | Organization and facility read, facility switch | Role administration, clinical records, billing adjustment |
| Billing officer | Billing read and create | Clinical records, billing adjustment |
| Patient | `organization.read` | Workforce and clinical records |
| Service principal | `organization.read` in its own organization | Clinical records, forwarded user identity |
| Auditor | Audit and policy read | Clinical records |

`clinical.sign`, `medication.prescribe`, `medication.dispense`, `laboratory.result.authorize`, `billing.adjust`, and `workforce.invite` are unimplemented and denied for every role. Wildcard permissions are denied. The clinical rows above are a proposed engineering matrix. They are not an approved clinical policy.

## API

`GET /api/access` returns the current principal's roles and permissions, or 401 when signed out.

`POST /api/access` evaluates an action for the signed-in principal. The organization on the session is authoritative. A different `organizationId` in the body is evaluated as a cross-tenant object and returns 404 without that identifier. A denied action returns 403 with `This action is not available.` A permitted action returns the policy version. The body cannot supply a role or a permission list.

`POST /api/tenancy/facility` still switches only among memberships. The switch now also requires `facility.switch`. A stale context version remains 409.

## Evidence and operations

`authorization_decisions` stores the principal, action, resource type, allowed scope, decision, reason, policy id, policy version, correlation id, and time. Counters in `authorization_controls` track allow, deny, the last evaluation latency, cross-tenant denials, and escalation denials. These rows are not the Phase 03 audit, consent, or privacy record.

The local policy check at `/access/diagnose` is available only when `CURASPHERE_DEV_DIRECTORY=local-test` and the process is not staging or production. It lists fixed synthetic principals and does not accept an arbitrary resource id.

## Schema versions

Foundation health reports schema 15 because Flyway V16 stores that value. Chart identity is schema 29. Chart authorization is schema 30. They are separate histories. A failed schema 30 upgrade rolls back with the migrate transaction. Restoring a migrated chart file means restoring a copy taken before the upgrade. `data/curasphere.sqlite` is not deleted as a rollback step.

## Directory sign-in

`openSession` throws unless `CURASPHERE_DEV_DIRECTORY` is `local-test` and `CURASPHERE_ENV` is neither `staging` nor `production`. The Next.js config sets the flag only in that local case. One development log line, before the callback ignore rule, contained an authorization code. Later callback lines do not include the query. The code is not repeated here.

## Threat notes

Client-supplied identity, role, permission, and facility ownership are ignored. Service callers cannot adopt another user id. Revoked assignments stop on the next decision because the cache version changes. Policy failure does not become allow-all. Guessed cross-tenant identifiers are omitted from decision scope.

No independent security, architecture, or clinical signature is recorded for this feature.

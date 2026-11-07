# Phase 02 proposed role matrix

Review ID: P02-R04
Status: PENDING
Policy: `p02-rbac-2026.10` version 1
Date prepared: 2026-10-14

These grants are proposed. They are not an approved clinical policy. Prescribing, dispensing, clinical signing, laboratory authorization, and billing adjustment stay unimplemented and denied even when another permission exists.

| Role | Class | Proposed permissions | Not granted |
| --- | --- | --- | --- |
| Doctor | Proposed clinical | `facility.read`, `facility.switch`, `clinical.read`, `clinical.create`, `clinical.update`, `medication.read`, `laboratory.order.read`, `laboratory.result.read`, `emergency.request` | Prescribing, dispensing, signing, audit, billing, role administration, emergency review |
| Nurse | Proposed clinical | `facility.read`, `facility.switch`, `clinical.read`, `clinical.update`, `medication.read` | Create clinical records, emergency request, prescribing, signing |
| Pharmacist | Proposed clinical, mostly inactive | `facility.read`, `medication.read` | Dispensing and prescribing. Those actions are hard-denied |
| Laboratory scientist | Proposed clinical, read only | `facility.read`, `laboratory.order.read`, `laboratory.result.read` | Result authorization, which is hard-denied |
| Receptionist | Administrative | `facility.read`, `facility.switch`, `organization.read` | Clinical read, emergency request, billing, audit |
| Facility administrator | Administrative | Facility manage and switch, workforce read, invite, update, assign-role, `security.role.read` | Organization suspend, `security.role.manage`, clinical, billing, audit, emergency review |
| Organization administrator | Administrative | Organization and facility administration, workforce including suspend, `security.role.read`, `security.role.manage`, `security.policy.read` | `billing.read`, `security.audit.read`, clinical permissions, emergency review |
| Billing officer | Administrative | `facility.read`, `billing.read`, `billing.create` | Clinical records. `billing.adjust` stays unimplemented |
| Auditor | Administrative review | `organization.read`, `facility.read`, `security.audit.read`, `security.policy.read`, emergency review and grant revoke | Clinical read. Opening a review does not reveal `syn_kojo_agyeman` |
| Patient | Own administration | `organization.read` | Workforce and clinical permissions |
| Service principal | Machine | `organization.read` | Forwarding another user, clinical actions |
| Platform administrator | Platform | `organization.read`, `security.policy.read` | Clinical and workforce administration |

The P02-F04 correction is still the code path: `seedAuthorization` deletes `billing.read` and `security.audit.read` from `organization-administrator`. Billing remains on `billing-officer`. Audit remains on `auditor`.

Decision requested from a clinical reviewer: APPROVE this matrix for later clinical use, APPROVE DEFERRAL while every clinical action stays inside this development system only, REQUEST CHANGES, or REJECT. A deferral does not approve production privileges. This document does not select one of those choices.

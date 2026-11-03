# Emergency access intended use, submitted for review

Review ID: P02-R05
Status: PENDING
Date prepared: 2026-10-14

## Engineering behavior now
Eligible requester: a workforce user with `emergency.request`, an active account, an active organization membership, a live session, and the development policy at DEMO_GH Accra. In the synthetic directory that is the doctor role. Kwame Boateng is the fixture clinician.

Excluded: reception, suspended or disabled accounts, expired or revoked sessions, service principals, organization administrators without `emergency.request`, and any caller when `CURASPHERE_ENV` is production or staging.

Resource and action: `syn_kojo_agyeman`, type `SyntheticRestrictedRecord`, action `synthetic.read`. The stored summary says it is not a diagnosis, a treatment recommendation, or a clinical chart.

Non-overridable: authentication failure, session failure, account or membership failure, cross-organization scope, confidential classification, prescribing, dispensing, signing, laboratory authorization, billing adjustment, bulk export, role administration, and a client emergency flag.

Required: a reason category, a justification of at least 8 characters, and a fresh TOTP or passkey. The engineering freshness window is 5 minutes. The engineering grant cap is 15 minutes. Both values are proposed. They are not approved clinical policy.

Review: an auditor with the emergency review permissions. The requester cannot close their own case. The reviewer does not receive the synthetic read. Alerts are local sandbox rows. Missing reviewer coverage blocks the grant.

Consent, privacy retention, and jurisdiction rules are not implemented. They belong to Phase 03 and to a selected production jurisdiction, which is unset.

## What this does not prove
The synthetic review workflow is an engineering control. It is not independent clinical validation. Passing tests do not enable production or staging break-glass.

## Decision requested
A clinical reviewer chooses one:

- APPROVE the development-only boundary and DEFER production intended use, duration, and freshness until a later clinical policy.
- APPROVE production intended use, including a stated duration and freshness, and name the jurisdiction. The software still refuses production until that policy is implemented. This packet does not implement it.
- REQUEST CHANGES.
- REJECT.

No choice is preselected.

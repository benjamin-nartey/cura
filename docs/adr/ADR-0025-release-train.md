# ADR-0025: A refusal gate is not a regulated release

Status: Accepted
Date: 2026-10-08

## Context
Phase 29 asks for an intended-use dossier, quality-system traceability, a risk-management file, verification, clinical evaluation, a change plan, and post-market surveillance for a module that would be a medical device. No regulator, notified body, or performance monitor is connected. Storing an approval or a benefit result would be a production mock.

## Decision
An auditor can store a strategy only as `not-approved`, and only for the jurisdiction tag `local-synthetic`. The dossier label is administrative. A clinical claim is refused and not stored. The trace cites `ADR-0022`, `RFC-0023`, and `R28`. A certificate number is refused. The risk file stays `not-reviewed`. Verification calls the AI Gateway and is stored only when the outcome is `refused`. Clinical evaluation stays `not-performed`. The change plan stays `not-authorized`, and another model id or version is refused. Surveillance stays `not-active` and stores the count of gateway refusals already on file. That count is not a performance rate. A different auditor can record a release attempt only after every gate exists, and the outcome stays `not-released`. The author cannot record it. The refusal gate stays disabled. An explain call goes through the AI Gateway and does not add an attempt.

## Consequences
Schema version 25 adds the release-train tables. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A regulator and a real performance monitor are connected. Until then, the module is not released.

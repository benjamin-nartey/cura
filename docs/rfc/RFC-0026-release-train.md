# RFC: Release train

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An auditor needs a record that this module has not been cleared for clinical use, and that a release attempt cannot skip the local gates.

## Goals / non-goals
Goals: a not-approved strategy, a dossier without a clinical claim, a local document trace, an unsigned risk file, a refused gateway check, a not-performed clinical evaluation, an unauthorized change plan, an inactive surveillance count, and a not-released attempt by a different auditor.

Non-goals: a regulatory approval, a signed risk file, a clinical benefit result, a model update, and a real-world performance rate.

## Data flow

```
auditor session, purpose AUDIT
    |
    v
strategy not-approved, jurisdiction local-synthetic
    |
    v
dossier label
    trace, unsigned risk file
    gateway refusal
    clinical evaluation not-performed
    change plan not-authorized
    surveillance not-active
    |
    v
different auditor
    release attempt not-released
    refusal gate stays disabled
gateway explain => refused, attempts unchanged
```

## Proposed design
`POST /api/release-train/strategy`, `/dossier`, `/trace`, `/risk`, `/validation`, `/clinical`, `/change`, `/surveillance`, `/attempt`, and `/explain`. Outbox events use the `release.*` names. A skipped gate publishes no attempt.

## Security and privacy
A clinician and an organization admin cannot open the page. Another organization is not listed. A label that contains a stored name, MRN, or birth date is refused. A clinical claim, a certificate number, and a benefit result are not stored. The dossier author cannot record the release attempt.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician files a strategy | Role must be auditor | Amira is forbidden |
| A statute is stored as an approval | Only `local-synthetic` and `not-approved` are accepted | `FDA` and `approved` are refused |
| A clinical claim is stored | A non-empty claim is refused | The dossier row is not inserted |
| A release skips a gate | Every gate row must exist | An early attempt throws and writes no attempt |
| The author releases their own dossier | The author is excluded | Priya is forbidden after the gates exist |
| An attempt promotes the model | The outcome is `not-released` and the gate stays disabled | The model version stays `0` |

## Observability
`GET /api/health` reports schema version 25. Surveillance stores the count of gateway refusals for the organization. Audit rows record each gate and a denied attempt.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 25. That deletes local writes.

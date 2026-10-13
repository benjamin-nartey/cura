# RFC: Care coordination and outreach

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A facility needs referrals, follow-ups, care plans, and a message that is withheld unless the patient preference allows it.

## Goals / non-goals
Goals: localized templates, consent and channel checks, an escalation task when outreach fails, referrals inside one organization, clinician-authored care plans, and care-gap tasks that cite a source row.

Non-goals: SMS, email, a copied chart, diagnosis, treatment advice, and a model-written message.

## Data flow

```
session facility
    |
    v
preference: locale en|es, channel portal|none, consent granted|withheld
    |
    +-- missing consent, channel none, or no template for that locale
    |       escalation task, no message row
    |
    +-- consent granted and channel portal
            copy the template body for that locale onto the facility record
    |
referral to another facility in the same organization
    destination accepts or declines
    origin chart is not copied
    |
care gap from the existing source-derived list
    task stores the source id and the derived sentence
```

Organization and facility come from the session. The client does not send the message body.

## Proposed design
`POST /api/care/preference`, `/message`, `/referral`, `/referral/decision`, `/plan`, `/plan/activate`, `/follow-up`, `/gap`, `/task`, and `/explain`. Outbox events `care.escalation`, `care.message`, `care.referral`, `care.plan`, and `care.task` carry ids, not the template sentence or the goal. Audit actions use the `care.*` names.

## Security and privacy
Another organization's referral is not listed. The destination facility sees the referral reason and not the rest of the chart. An auditor cannot open coordination. A nurse cannot create a referral or a care plan.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| Message sent without consent | No preference or withheld consent stores no message and opens an escalation task | Outcome is escalated and the message count stays 0 |
| Wrong language | The body is selected by the stored locale. An English-only template fails for Spanish | Spanish follow-up body is the Spanish template. `tpl_record_en` escalates |
| Model rewrites the template | Gateway refuses before any adapter. `holdOutreachBody` ignores the payload | Probe adapter is not called. Body stays the template |
| Cross-organization referral | Destination facility must belong to the session organization | Lakeside is not found. East Annex can accept. Evan sees no incoming referral |

## Observability
`GET /api/health` reports schema version 12. Audit rows record preference, message, escalation, referral, plan, and task changes.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 12. That deletes local writes.

# ADR-0012: Outreach uses a stored template and consent

Status: Accepted
Date: 2026-10-08

## Context
Phase 16 asks for referrals, follow-ups, care plans, task ownership, patient messaging, and a care-gap engine. This slice has no SMS or email provider and no allowlisted model. A fabricated delivery receipt, or a model that writes the message, would be a production mock.

## Decision
Message templates exist only in English and Spanish under `outreach-templates-2026.10`. The body stored for a patient is the template row for that patient's locale. Consent must be granted and the channel must be the facility record. Otherwise the send stores nothing and opens an escalation task with failure `consent`, `channel`, or `locale`. Completing that task does not send the message. Referrals stay inside the organization and do not copy the chart. Care-gap tasks copy the sentence already derived from a source row. Care-plan goals are the text a clinician typed. A gateway explanation cannot replace a template or a goal.

## Consequences
Schema version 12 adds the coordination tables. There is no outbound transport. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed transport is allowlisted. It still has to refuse when consent is missing, and a model still cannot replace the template body.

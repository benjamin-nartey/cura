# ADR-0008: The copilot repeats supported claims

Status: Accepted
Date: 2026-10-08

## Context
Phase 12 asks for an evidence-grounded summary and a patient-scoped conversation, without autonomous diagnosis or treatment. No model is allowlisted. A generated sentence would be a production mock.

## Decision
The grounding threshold is 1. A summary is released only when every stored claim for that patient is supported and cited. The shown lines are those claims, grouped into summary, what changed, abnormal, and open items. A question is answered only when every matched claim is supported; otherwise the turn is stored as blocked and the answer is empty. Diagnosis and treatment wording is blocked before retrieval. The question text is not stored, only a hash of the redacted text. Feedback records helpful or not-grounded and does not change the claim or the chart. This path does not call the gateway because it does not call a model.

## Consequences
Schema version 8 adds `copilot_turns` and `copilot_feedback`. One invalidated claim hides the summary and appears in the flagged list. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed model is allowlisted. Any generated sentence must pass the gateway and this threshold before it is shown.

# RFC: Model gateway control plane

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Later phases must not call a model on their own. This slice needs a single gate that records the attempt and returns no generated text while no model is allowlisted.

## Goals / non-goals
Goals: a prompt registry, a model registry, a token budget, redaction, a trace id, a model version on every attempt, schema and phrase checks, and a refusal when the provider is absent or down.

Non-goals: a live provider, a fake completion, and writing model text onto the chart.

## Data flow

```
session organization
    |
    v
invokeGateway
    |-- redact identifiers --> hash only
    |-- prompt disabled or clinical-generation --> refused (mdl_none version 0)
    |-- no allowlisted model --> refused
    |-- budget exceeded --> quota, adapter not called
    |-- adapter throws --> unavailable, output empty
    |-- schema or phrase fails --> invalid-output, output empty
    |
    v
gateway_attempts + outbox gateway.attempt (ids and versions, not the text)
```

The HTTP route does not pass an adapter. Facility and organization come from the session.

## Proposed design
`POST /api/gateway/invoke` accepts only the registered chart-draft prompt. `GET` is not required; the gateway page lists traces for the session organization. Idempotency replay returns the same trace and does not call an adapter again.

Structured output, when a test adapter returns a value, must be an object with a non-empty `citations` array and must not contain treatment language. That value is not filed as an evidence claim.

## Security and privacy
Attempts from another organization are not listed. The stored record has a hash of the redacted input, not the input. Outbox payloads omit the text. Auditors in the same organization can see traces because the text is not in them.

## Clinical hazards
A refused attempt must not be read as a draft note. The page says nothing was generated. An accepted test payload stays in `gateway_attempts` and does not enter the chart.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Direct provider call | Only `invokeGateway` selects a model, and the route passes none | Clinical prompt calls the adapter zero times |
| Prompt injection stored as a note | Output that fails the schema or the phrase check is discarded | "should start insulin" is absent from the table |
| Cross-organization traces | Organization filter | Evan does not see Amira's trace |
| Provider outage becomes a guess | Exception becomes `unavailable` and empty output | Thrown adapter |

## Rollback
Schema version 6 adds the gateway tables. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers policy refusal, redaction, idempotent replay, quota without a call, provider failure, rejected output, accepted output that does not create an evidence claim, and organization isolation.

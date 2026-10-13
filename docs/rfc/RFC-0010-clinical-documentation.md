# RFC: Clinical documentation drafts

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
An encounter needs a draft note that a clinician reviews. Audio must not become a note unless a real transcriber exists, and nothing may sign itself.

## Goals / non-goals
Goals: a consent indicator, configurable audio retention, source-quote drafts, a visible split between source quotes and clinician edits, and accept or reject without signing.

Non-goals: speech-to-text, speaker labels, model extraction, and writing the accepted draft onto the chart.

## Data flow

```
session facility
    |
    v
open encounter + consent granted
    |-- clinician text --> source-quote sections, status draft, signed 0
    |-- audio + retention 0 --> hash only, bytes discarded, no transcript
    |-- audio + retention > 0 --> bytes kept until expiry, still no transcript
    |
    v
explicit accept or reject
    |
    v
status changes, signed stays 0, chart unchanged
```

Organization and facility come from the session. The encounter must belong to that facility.

## Proposed design
`POST /api/documentation/consent`, `/text`, `/audio`, and `/draft`. Audio retention defaults to 0 hours and can be set from 0 to 72. The database check rejects `signed` other than 0. Outbox payloads carry ids and status, not the note text.

## Security and privacy
Drafts from another facility are not readable. Audio is not kept when retention is 0. Consent is required before capture.

## Clinical hazards
A draft chip and an accepted chip are different. Accepted does not mean signed. Source quotes stay visible after a clinician edit. No orders are created.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Auto-sign | No sign function succeeds, and the column cannot store 1 | `signDocumentation` throws and `signed` stays 0 |
| Fake transcript | Audio capture stores no transcript and creates no draft | Transcript column is null |
| Audio kept against policy | Retention 0 discards bytes | `audio_bytes` is null |
| Cross-facility accept | Facility filter | Evan cannot decide Amira's draft |

## Rollback
Schema version 9 adds the documentation tables. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers consent, draft versus clinician-authored text, accept without chart writes, the sign refusal, retention, missing transcripts, and organization isolation.

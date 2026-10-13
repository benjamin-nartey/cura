# ADR-0009: Draft notes are not signed

Status: Accepted
Date: 2026-10-08

## Context
Phase 13 asks for encounter documentation from audio or text, with consent, speaker handling, a draft, and explicit review. This slice has no speech-to-text engine and no allowlisted model. A fabricated transcript would be a production mock.

## Decision
Consent is a stored row for an open encounter. Text the clinician types is split into source quotes and kept as a draft. Audio is not transcribed. Speaker labels are unsupported. Audio bytes are stored only when the organization retention setting is above 0 hours; the seeded setting is 0, so the bytes are discarded. Accept and reject are explicit. The draft table cannot store a signed row. Acceptance does not write the chart.

## Consequences
Schema version 9 adds the documentation tables. There is no sign action. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed speech-to-text engine is allowlisted, and any extracted sentence still has to pass the gateway and the grounding threshold before it can leave the draft.

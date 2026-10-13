# ADR-0005: Derived lines need an evidence state

Status: Accepted
Date: 2026-10-08

## Context
Phase 09 asks for claims, citations, and sufficiency rules before any model writes a sentence. The patient state already restates source rows. Those sentences need a recorded link back to the row they came from.

## Decision
A patient-state rebuild files one claim per derived line. Each claim stores `supported` and a citation whose hash is the source row at filing time. A claim with no citation is refused and is not stored. On later reads, a missing or changed source moves that claim to `invalidated`. The old sentence stays visible with that state. A new rebuild can file a new supported claim. The unfilled risk slot is not a claim. No model is called.

## Consequences
Evidence permissions are the chart permissions. Schema version 5 adds `evidence_claims` and `evidence_citations`. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A model is allowed to draft a sentence. That draft still has to enter this store with a citation, or it is not shown.

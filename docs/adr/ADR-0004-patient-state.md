# ADR-0004: Patient state is a rebuildable copy

Status: Accepted
Date: 2026-10-08

## Context
Phase 08 asks for a versioned PatientState covering active problems, medications, allergies, recent results, open items, pending work, and risk-signal slots. The chart source rows remain authoritative.

## Decision
A clinician rebuild writes a new `patient_state_builds` row when the source hash changes. The same sources keep the same version and the same built-at time. A later source write does not edit the build. The chart shows that the build is stale until the next rebuild. Two results at the same effective time are stored as a conflict and are left out of the latest-result list. The deterioration slot stays unfilled. This slice does not calculate a score.

## Consequences
The build can lag the chart. Rollback of schema version 4 is to stop the app and delete `data/curasphere.sqlite`. Old builds are removed with the file.

## Revisit trigger
A hosted workflow needs to rebuild the state outside the request, or a reviewed rule is allowed to fill the risk slot.

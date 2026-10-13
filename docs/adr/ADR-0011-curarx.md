# ADR-0011: Medication warnings come from a local pin

Status: Accepted
Date: 2026-10-08

## Context
Phase 15 asks for prescribing, dispensing, administration history, allergy checks, interactions, duplicate therapy, refill or adherence signals, and a formulary. This slice has no drug-knowledge vendor and no allowlisted model. A fabricated interaction monograph, or a model that clears a warning, would be a production mock.

## Decision
The formulary and the safety rules are the local pins `formulary-2026.10` and `med-safety-2026.10`, source `local-pin`. A proposal stores every fired warning with that rule id, version, and source. High severity blocks the medication-list write until the warning is acknowledged. Acknowledgement does not change the severity. Dispense and administration rows are history. The adherence sentence restates those stored counts. An explanation that needs a model goes through the gateway, which refuses clinical generation. Gateway output is not written onto the warning, and `holdSafetyWarnings` ignores a model payload.

## Consequences
Schema version 11 adds the prescription tables. Rollback is to stop the app and delete `data/curasphere.sqlite`. The pins are not a universal formulary or interaction database.

## Revisit trigger
A reviewed medication-knowledge source is pinned, and any model sentence still has to pass the gateway. A model still cannot set a high-risk warning to clear or skip acknowledgement.

# CuraEval: AI Evaluation and Governance

## Evaluation dimensions
Task correctness, groundedness, citation correctness, omission risk, harmful advice, prompt injection resistance, PHI leakage, subgroup performance, consistency, latency and cost.

## Promotion pipeline
Candidate model/prompt -> offline eval -> red-team -> clinical reviewer eval -> shadow -> A/B where ethical/appropriate -> production canary -> continuous monitoring.

## Required artifacts
Model card, dataset card, prompt card, evaluation report, known limitations, rollback version, approval record and monitoring plan.

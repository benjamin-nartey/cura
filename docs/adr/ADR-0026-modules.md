# ADR-0026: One card per module, no blanket clearance

Status: Accepted
Date: 2026-10-08

## Context
Phase 30 asks for imaging, ECG, pathology, dermatology, maternal, cardio, and oncology intelligence, each with a dataset, an independent validation, a workflow study, an explanation, and performance monitoring. No image, tracing, slide, or model output is stored. A shared approval for all seven would be a production mock.

## Decision
The catalog pin `module-catalog-2026.10` names those seven modules. Each has its own intended-use sentence and its own model card. Both are constants. A client cannot replace them. A payload is refused, including anything longer than 1024 characters. A stored module stays `not-cleared`. A different auditor can record a validation only when the AI Gateway returns `refused`. A workflow study stays `not-run`. Performance stays `not-calculated`, and a score, subgroup, or site value is refused. Clearing one module is refused. Approving every module is refused and writes no row. An explain call goes through the AI Gateway and does not change a module.

## Consequences
Schema version 26 adds the module tables. There is no score column and no payload column. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A module has a connected dataset and a model that is actually allowlisted. Until then, every module stays not-cleared.

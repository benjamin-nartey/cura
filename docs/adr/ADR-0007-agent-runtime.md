# ADR-0007: Agent steps are durable rows

Status: Accepted
Date: 2026-10-08

## Context
Phase 11 asks for a permissioned tool-calling runtime on Temporal. ADR-0001 keeps Temporal as the production target. This workspace has no Temporal service, and the slice must not pretend a workflow engine is running.

## Decision
Agent manifests, tool permissions, run steps, and human approvals are rows in the local database. A run commits each step before it returns. Resume reads the last committed step, so a pending approval is still there after the process restarts. The seeded chart-review agent may read source identifiers and then park. It cannot call a model. A tool that is missing from the manifest is refused. A draft tool with execution disabled does not change the chart. The only model path is the gateway, and the seeded clinical prompt still refuses generation.

## Consequences
Schema version 7 adds the agent tables. There is no Temporal client in the request path. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A hosted workflow engine is introduced, or a reviewed model is allowlisted for an agent.

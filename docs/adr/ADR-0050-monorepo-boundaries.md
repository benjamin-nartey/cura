# ADR-0050: Monorepo workspaces keep one clinical model

Status: Accepted
Date: 2026-10-13

## Context
Phase 01 requires apps/web, apps/mobile, services/*, ai/*, packages/contracts, design-system, fhir, and infra. Those application workspaces already exist except the Python AI scaffold, the FHIR package, and infra. `@curasphere/domain` already maps FHIR R4. The chart seed already contains fictional Harborlight and Northwind records. The source docx is not in this checkout. The phase specification reproduces the Phase 01 scope.

## Decision
Keep the existing web, mobile, and foundation code. Add `@curasphere/fhir` as a profile pin that names `@curasphere/domain` as the mapping owner. Add `ai/gateway` as a FastAPI process that reports health and refuses clinical generation. Keep apps/mobile outside the npm workspaces so Expo resolution stays unchanged. Add `fixtures/platform/ghana-organizations.json` as fictional Ghana organizations with no patients and do not load it into the chart database. Reserve `infra/` with no secrets.

## Consequences
`npm run typecheck` includes `@curasphere/fhir`. The AI scaffold is not a second gateway implementation and does not read the chart. Rollback is to remove `ai/gateway`, `packages/fhir`, `fixtures/platform`, `infra/README.md`, `tools/platform`, this ADR, and the `platform:skeleton` script. No database migration is involved.

## Revisit trigger
Local infrastructure compose is added for PostgreSQL, Redis, Kafka, and Temporal. Do not start that compose until this skeleton type-checks.

# ADR-0001: Foundation runtime

Status: Accepted
Date: 2026-10-08

## Context
Phase 1 asks for a polyglot monorepo and a one-command local environment. The target production stack in the architecture pack is Next.js, Kotlin/Spring, PostgreSQL, Kafka, and Temporal. This workspace has Node.js 22 and Docker, and does not have a JDK. The first slice has to run, test tenancy, and show the clinician workspace.

## Decision
The foundation slice is a TypeScript monorepo:

- `apps/web` — Next.js clinician workspace
- `packages/contracts` — shared DTO types
- `packages/design-system` — teal, blue, and neutral visual tokens
- `packages/domain` — chart rules, tenancy, audit, outbox, SQLite

SQLite via `node:sqlite` is the local transactional store. Clinical writes and the outbox row commit in one transaction. PostgreSQL, Kotlin services, Kafka, and Temporal remain the production target and are not stubbed in the request path.

Workforce sign-in is a development directory. It is refused when `CURASPHERE_ENV=production`. There is no clinical AI in this slice, so nothing calls a model.

## Consequences
Local setup is `npm install` and `npm run dev`. Tests do not need Docker. The process is a modular monolith, not the nine-layer deployment in the architecture pack. A later phase must replace SQLite with PostgreSQL and move transactional services to Kotlin before any shared or hosted environment.

## Alternatives considered
- Scaffold Kotlin anyway and leave it unbuilt. Rejected: Phase 1 requires a running local environment.
- Docker Compose Postgres from day one. Deferred: SQLite keeps the tenancy tests hermetic. Revisit with the first Kotlin service.

## Security/privacy/clinical impact
The directory has no passwords and must not be exposed. Tenant and facility come from the user row on each request. Synthetic seed data is labeled in the interface. No model output is stored.

## Revisit trigger
First hosted deployment, first long-running workflow, or the start of the Kotlin service extraction.

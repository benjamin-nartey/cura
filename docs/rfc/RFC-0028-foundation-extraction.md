# RFC-0028: Start the Kotlin foundation on the local PostgreSQL

Status: Accepted
Date: 2026-10-08

## Problem
The chart process is still the TypeScript modular monolith from ADR-0001. The architecture pack names Kotlin and PostgreSQL as the transactional services. Starting that move with a fake broker, or by copying every chart table in one pass, would either stub a system that is not connected or break the running chart.

## Decision
Add one Spring Boot service for organizations, facilities, workforce users, sessions, audit, and the outbox. Seed the same synthetic workforce identifiers the chart already uses. Put directory listing and session open and close on the request path. Leave chart tables on SQLite until a later extraction moves them.

## Non-goals
No Kafka topic, no Temporal workflow, no second unused database, and no clinical generation.

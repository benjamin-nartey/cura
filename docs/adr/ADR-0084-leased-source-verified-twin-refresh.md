# ADR0084 — Leased source-verified Twin refresh

Status: local implementation decision; qualified review pending.

Keep F02 materialization bytes/rules immutable and add operational refresh evidence separately. Use data-type-specific background verification deadlines, with source and clinical timestamps distinct. No clinical expiry policy is invented. A real separately executed worker refreshes from the existing authorized source inventory and appends repair using F02. Successful immutable checkpoint binds exact build/source/state hashes and verifiedAt.

Persist owner/context-bound leased jobs and idempotent commands with immutable transitions. Retain failed and cancelled evidence; fence late workers. Build and checkpoint commits are deliberately distinct: partial derived progress is reported without serving partial clinical state or falsely recording successful verification. Source writes and clinical reconciliation remain outside Twin. The source workspace remains independent while jobs are pending or fail. Live identity is supplied/rechecked at execution; job metadata is never an authorization credential.

Local engineering verified 2026-11-05; qualified review remains pending. Actual source-stage interruption, fencing, two-step correction propagation, live worker/UI, bounded watch and original-data preservation evidence are linked in docs/twin/P08-F04-evidence.md. Operational verification is not a clinical signoff or production capacity certification.

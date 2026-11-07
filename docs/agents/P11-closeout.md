# Phase 11 agent runtime closeout

Formal acceptance is blocked. The Phase 11 register remains `NOT_STARTED` for formal progression. The work and evidence below apply to the local synthetic workspace. Production clinical functionality remains disabled.

| Feature | Local engineering evidence |
| --- | --- |
| P11-F01 Manifest and permission boundaries | [Manifest validation](P11-F01-validation.md) |
| P11-F02 Typed tool registry | [Tool, scope, and relationship checks](P11-F02-validation.md) |
| P11-F03 Durable execution | [Temporal worker and recovery](P11-F03-validation.md) |
| P11-F04 Human approval tasks | [Approval inbox, expiration, and decision handling](P11-F04-validation.md) |
| P11-F05 Run visibility and safety | [Trace, organization stop control, and safe decline](P11-F05-validation.md) |

The Agents page exposes scoped traces and review tasks. Commands use `/api/agents/run` and `/api/agents/approval`. SQLite owns run state, tool checkpoints, approvals, and the organization stop control. Temporal receives opaque run IDs. The existing audit stream and `agent.run` and `agent.approval` outbox events provide evidence for transitions.

| Exit criterion | Local evidence |
| --- | --- |
| Agents cannot exceed manifest permissions | The read-only chart reviewer retrieved scoped source IDs. The closeout rejected medication and scheduling tool requests. Existing tests reject broadened manifests, injection, cross-facility access, and revoked patient relationships. |
| Retries are idempotent | The Temporal retry preserved exactly two steps and one approval. A duplicate workflow start returned the original outcome. |
| Human approval survives failure | The fixture terminated a real worker after it persisted the approval and before it acknowledged the activity. A replacement worker recovered the run. Two independent SQLite processes then competed to approve or decline. One committed and the other received a conflict. |

The current manifest supports chart review. The prescribed receptionist scheduling agent scenario remains unverified because the registry has no scheduling tool or receptionist manifest. Medication execution is outside the local manifest. The encounter-author relationship rule, hosted worker identity, production capacity and recovery targets, qualified safety, privacy and architecture review, and prerequisite acceptance remain pending.

The migration 62 to 63 check injected a table collision, verified the schema 62 queued run survived, and retried the upgrade. It ran with `node --import tsx --import ./packages/domain/test/dev-env.ts --test tools/agents/migration.test.ts`. A rollback uses a pre-migration backup with the matching build. The schema 63 restore procedure has documentation and the migration test covers failed-upgrade recovery.

P11-F05 recorded 661 passing domain tests, type checking, boundary lint, and a signed-in browser check of organization stop and safe decline. The closeout changes add validation fixtures and evidence.

The isolated Temporal Compose project passed the crash, duplicate submission, approval race, cancellation, and invalid manifest scenario with the local synthetic sandbox flags and `node --import tsx --test tools/agents/temporal.test.ts`. Cancellation and invalid manifests produced zero steps. The closeout optimized build passed with `npm run build --workspace @curasphere/web` using a separate build directory and synthetic database. Logs are under `artifacts/governance-v2/P11-closeout`.

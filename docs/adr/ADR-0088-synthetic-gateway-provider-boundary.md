# ADR 0088 Synthetic gateway provider boundary

Proposed for qualified review on 2026-11-07. The product owner authorized P10-F01 local synthetic engineering after the Phase 09 closeout.

The domain services share a synchronous gateway with established registry, quota, receipt, and audit behavior. The provider boundary keeps that caller contract and introduces a versioned local runner and a versioned hosted relay adapter. The relay accepts a server-owned synchronous JSON exchange. The engineering scenario supplies an in-process synthetic exchange. A live hosted transport requires a separate approved egress design, including timeout, concurrency, and privacy controls.

Both adapters receive a trace, registered prompt version, registered model identity, and bounded redacted input. Hosted responses must match the request trace and provider/model identity. Their output is reduced to bounded text and citation fields before the existing gateway schema and safety checks. The new factories require the local synthetic sandbox, and the gateway decides permission and quota before invoking them.

The repository CI checks server-side business code for direct transport and model SDK use. Existing identity, integration delivery, and Foundation client boundaries have narrowly scoped exceptions for their established transports. The guard operates on source code. Deployment egress controls remain a separate review item.

Existing gateway attempts, audit records, idempotency receipts, and the `gateway.attempt` outbox event carry the engineering evidence. Schema 59 applies. The existing Gateway workspace continues to show attempt outcomes and model versions. The adapter choice is a server configuration decision.

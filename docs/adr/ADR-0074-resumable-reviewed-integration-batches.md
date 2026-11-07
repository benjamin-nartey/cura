# ADR-0074 — Resumable reviewed integration batches

Status: implemented and locally verified; formal review pending.

Reuse F03 authenticated receipt processing, clinical recording/correction and transactional outbox. A separately domain-separated signed batch manifest authenticates the exact immutable contained message bytes. Claiming/reviewing a batch requires current treatment authority; transport receipt never creates a clinical event. Each item and cursor update share one SQLite transaction. Durable page runs retain idempotency and lease identity; partial committed work survives process loss.

Export manifests snapshot identities and versions, not an unsupported HL7 Bulk Data protocol. Changed source versions are reported as conflicts. Recovery retains original bodies and failure history; malformed content cannot be force-promoted. Delivery redrive retains stable message/body identity so an acknowledged-late partner deduplicates it. Current session and source authorization are mandatory; no new service-principal clinical bypass is introduced.

Use bounded local manifests/pages and opaque signed dashboard cursors. Scope hashes contain no plaintext session secret. Retain completed/failed evidence and use forward fixes/disable as operational rollback. Destructive fixture rollback is not a production procedure. No production transfer, qualified clinical/licensing approval or standards certification is asserted.

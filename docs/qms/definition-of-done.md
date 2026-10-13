# Definition of done — foundation slice

A change to this slice is done when:

- The intended user and non-goals are still accurate in the register, or the register is updated.
- Tenant and facility are still taken from the session, never from the client body.
- State-changing chart APIs stay idempotent and write the outbox in the same transaction.
- New sensitive reads and writes append an audit row.
- `npm test` and `npm run typecheck` pass.
- The interface still states that records are synthetic and that derived text does not direct care.
- Chart rollback remains “stop and delete the local SQLite file.” Foundation rollback is to stop the Kotlin service and drop the local `curasphere` database. Kafka and Temporal stay unconnected.

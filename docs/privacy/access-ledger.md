# Access ledger

P03-F01 stores append-only access entries in `access_ledger` at chart schema 33. Each row records the actor id, subject id, facility id, purpose, action, resource identifiers, correlation id, and hashes of the before and after metadata. The metadata allows only `resourceType`, `resourceId`, `version`, and `fields`. Names and descriptive text are rejected.

The entry hash covers the previous hash and the stored identifiers. Update and delete triggers abort with `ledger-sealed`. `verifyAccessLedger` recomputes the chain so a change made after the trigger is removed is still detectable. `listAccessLedger` requires `security.audit.read` and returns only the caller's organization.

`writeAudit` appends a ledger row for existing sensitive reads and writes. The web page is `/audit/ledger`. The API is `GET /api/audit/ledger`. Both refuse callers without audit permission.

Rollback drops the ledger objects, removes schema version 33, and records version 32. The next database open applies the version 33 upgrade again.

This feature is experimental local development. Formal Phase 03 remains NOT AUTHORIZED.

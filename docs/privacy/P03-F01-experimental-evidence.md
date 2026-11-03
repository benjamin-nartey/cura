# P03-F01 experimental evidence

This is experimental engineering evidence. Formal Phase 03 remains NOT AUTHORIZED. P02-R01 through P02-R06 remain PENDING. DEV-GOV-2026-001 remains PROPOSED.

## What was verified

Chart schema 33 adds `access_ledger`. Rows are append-only, chained by hash, and limited to identifiers and metadata hashes. Update and delete triggers abort. A hash check detects a change if the trigger is removed. Queries require `security.audit.read` and stay inside the caller's organization. Names and descriptive text are rejected. Production emergency access stays ineligible when the local override flag is set.

The auditor page at `/audit/ledger` shows the hash-chain status and the stored actions. A nurse session for Akosua Owusu receives the auditor-only message. `GET /api/audit/ledger` returned the DEMO_GH chain for Esi Boateng and marked the response experimental, with formal Phase 03 not authorized.

## Commands

- `node --test tools/governance/local-experiment.test.mjs` — 4 passed.
- `npm run governance:test` — 10 passed. The formal checker still leaves the exception proposed.
- `npm test --workspace @curasphere/domain` — 215 passed, 0 failed.
- `npm run typecheck --workspace @curasphere/domain` and `npm run typecheck --workspace @curasphere/web` — passed.

## Rollback

`LEDGER_ROLLBACK` drops the ledger, removes schema version 33, and records version 32. The next open applies the version 33 upgrade again. P03-S06 covers that path.

## Unresolved

The 44 high Debian findings remain open. Hosted CI remains unverified. Human signatures remain pending. The live chart database was upgraded to schema 33 by opening the ledger. That upgrade is additive.

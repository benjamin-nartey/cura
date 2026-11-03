# P04-F05 completion plan

Scope: finish the existing experimental billing primitives and unified chart in the local synthetic sandbox. Formal Phase 04 remains NOT_STARTED. No production, staging, external clinical transmission, payment collection, deployment, or Phase 05 work is authorized.

The source DOCX Phase 04 requires normalized source records, transactional/versioned APIs, optimistic concurrency, idempotency, no AI dependency, and documented ownership. ADR-0070 retains the existing local SQLite domain as owner; the foundation service owns workforce sessions. No architecture replacement is planned.

Inventory found schema 42, billing APIs/screens/tests, and chart aggregation already present but not accepted. Risks to resolve before acceptance:

- Facility-wide pending work must not appear in a single patient's chart. Filter orders, tasks, plans, and referrals by patient in the authorized query.
- A successful idempotency replay must revalidate charge visibility. A same-organization billing officer at another facility must not retrieve a cached financial response.
- Catalog effective dates and expiry must be enforced; financial reads must be attributable; operational metrics must reflect stored counters.
- Loading, denied, empty, partial failure, retry, stale conflict, and closed-visit states must be explicit and must not imply absent findings.
- Existing test appointments dated October 2026 are now in the past. Freeze the clock in affected isolated tests and their race workers, preserving production's past-booking rejection.

Acceptance: regression tests for each defect, existing billing/concurrency/rollback tests, full domain regression, typecheck/build, governance and contract checks, and an actual synthetic visit UI journey. Evidence must distinguish failures and unavailable dependencies from passing checks. Human approvals remain pending and must never be generated.

# ADR-0062 — Synthetic consent directives

Status: Proposed as an engineering record. This is not an architecture approval.

## Decision

Consent for communication, local sharing, and research is stored in chart schema 34 and evaluated in the domain service. The existing authorization function remains the RBAC decision. A consent allow cannot create a permission the role does not have.

Policies are seeded by the server. Callers do not supply a policy identifier. The only jurisdiction context shipped here is `synthetic-development`.

Withdrawal writes an immutable version, blocks queued dispatches for that action, and is rechecked before a local sink delivery. FHIR R4 Consent mapping is deferred until a conformance test exists.

## Consequences

P03-F03 still owns retention and legal hold. This ADR does not decide how long consent history is kept.

# ADR-0070 — Billing primitives and unified chart UX

Status: experimental engineering. Not a production financial or clinical authorization.

P04-F05 adds chart schema 42 for a synthetic charge catalog, charges, charge items, adjustments, and immutable billing versions. The older revenue screens remain. They are not the authoritative Phase 04 charge record.

Amounts are stored as integer minor units. The Accra catalog uses GHS with two minor digits. Totals are calculated on the server. Currencies are not mixed. Local finalization does not issue an invoice or create a payment obligation. Transmission and collection stay denied.

Clinical and financial privileges stay separate. Billing officers receive charge create, review, adjust, and void. Clinicians may see a status indicator without amounts. Organization administrators do not inherit billing charge privileges.

The unified chart at `/patients/{id}/chart` reads existing master, clinical source, work, appointment, and billing modules. It does not create a second patient master and does not invent missing findings.

Schema 43 is an additive follow-up for databases already at experimental schema 42. Insert/update guards reject invalid minor amounts and mismatched tenant/patient/encounter/catalog links. Adjustment rows are immutable. Existing rows are preserved. The synthetic-only billing rollback removes both migration markers and billing tables, retaining schema 41 clinical/work data.

Chart pending queries filter all four work collections by the selected patient. Billing retries check current charge visibility before returning cached responses. Mutations recheck commands inside the write transaction and reject unexpected source versions. Form keys hash the full tuple; a per-form submission token distinguishes an intentional additional charge from a retry. Catalog effective dates are enforced at creation. Billing metrics use tenant/facility-scoped persisted counters.

Billing and unified chart reads explicitly require all four local synthetic override variables and reject protected environments, real data, production credentials, external healthcare, publication, and clinical emergency enablement. These checks do not activate formal governance approval.

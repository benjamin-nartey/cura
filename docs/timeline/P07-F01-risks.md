# P07-F01 hazards and controls

- Wrong patient/version: scoped patient authorization, per-record read, immutable ledger identity/hash, reauthorized source inspection and patient-bound event lookup.
- Historical fact presented as current: source version and historical badge remain explicit; original snapshots never replaced by current row values.
- Unknown/backdated clinical time: independent event/recorded times, date precision and explicit unknown; no inferred normal finding.
- Unauthorized history: treatment/history/kind permissions, tenant/facility, account/session checks and inherited source-policy evaluation at each read.
- Missing/corrupt/oversized evidence: unavailable response rather than incomplete success; bounded transaction and complete version-chain checks.
- Stale client/navigation: no-store fetches, abort/cancel, clearing failed views and no offline cache. Data already viewed cannot be recalled; refresh/inspection rechecks access.
- LLM clinical invention/action: no model calls or clinical mutations in this feature; fixed templates use only source display/version. Medication drafts remain non-executable.

Automated tests are engineering evidence, not clinical approval. Formal and qualified reviews remain pending, including intended-use and source narrative semantics. No external patient data, production activation or terminology license claim.

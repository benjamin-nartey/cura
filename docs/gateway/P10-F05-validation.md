# P10-F05 Traceable outputs and UI

The gateway records a trace for every attempt. A synthetic result carries the provider, versioned prompt and model, provider-reported citation references, latency, estimated dispatch units, and a human review requirement. Citation references are unverified. Refusals and failures expose the recorded reason and retain no generated output. Historical attempts remain inspectable with unavailable metadata identified explicitly.

The Gateway workspace shows tenant budget and outage status for visible model routes. Staff can inspect their own attempts within their current scope. Administrators can inspect attempts within their assigned facility or across their tenant when they have no facility assignment. The trace view exposes metadata and citation references without returning stored generated prose or submitted text.

Schema 62 adds trace metadata alongside the existing attempts and dispatch ledger. The gateway writes provenance in the same transaction as the attempt, receipt, and usage records. The cost shown is the sum of estimated input units charged per dispatch. The duration measures gateway processing for the original attempt. A replay preserves the original receipt. Old receipts and trace rows retain their recorded values.

The Gateway page is the authenticated read interface. `/gateway?trace=TRACE_ID` opens an attempt directly. The trace identifier remains the correlation key in the existing audit and outbox records. An operator can use the trace identifier to investigate a failure and follow the existing manual review procedure. Restore a pre-migration backup with its matching build to roll back the database.

## Verification

- The full domain suite passed all 657 tests. The focused gateway suite passed 12 tests, including persisted provenance, legacy traces, clinician isolation, quota, and outage recovery.
- Domain and web type checks, gateway boundary lint, and the optimized web build passed.
- Playwright verified that a signed-in clinician could open an accepted synthetic trace from Recent traces, inspect its citation reference and review requirement, and see the budget status. A second clinician could not open the same trace. The page withheld the generated prose. Evidence is under `artifacts/governance-v2/P10-F05`.

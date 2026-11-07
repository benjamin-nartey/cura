# P12-F02 Claim-grounded summarization

Clinicians can open the Versioned patient summary from the chart. The read-only API is `GET /api/copilot/summary?patient=PATIENT_ID`. It checks the same local synthetic clinician and patient access as the context preview. The summary uses the current, authorized patient twin and returns an empty result when the twin is missing, stale, or unavailable.

Fixed templates organize active issues, medication drafts, allergy assessments, recent labs and observations, and pending work. Each displayed claim cites the exact twin fact, source version, recorded time, and source hash. The inspection link rechecks authorization and freshness. Preliminary and unconfirmed records are marked for review. Conflicting or incomplete assertions are withheld. Unverified Evidence Graph prose is excluded. The current-source requirement preserves the grounding threshold of one citation for every emitted claim.

The preview considers source versions recorded in the last 90 days and inspects up to 12 eligible items per section. Empty sections describe available source coverage. The medication section covers drafts only. The system derives the result on demand from persisted source versions and audits the read. Schema 63 stays compatible, and the summary uses no model transport.

Five focused domain tests passed, including exact citation resolution, preliminary-result labeling, rejection of uncited graph prose, cross-patient isolation, and suppression of a stale summary after source correction. Web type checking and gateway boundary lint passed. Qualified review remains pending.

A signed-in Playwright check displayed a cited observation in the chart and followed its citation to the exact authorized source. Logs and a screenshot are in `artifacts/governance-v2/P12-F02`.

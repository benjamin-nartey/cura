# P09-F03 evidence sufficiency

Local synthetic continuation under the existing Phase 09 simulation authority. The assessment runs on read, after the existing claim and source access checks, against links to the current revision. It adds no schema or clinical write.

The versioned local policy requires one distinct dated supporting record for a source assertion and two for hypotheses, care-gap questions, and risk questions. These are simulation thresholds selected for engineering validation. Qualified approval is pending before any clinical use.

A missing minimum, changed or unavailable source, contradiction, insufficient annotation, or unknown effective time on supporting evidence produces an insufficient result with explicit flags. Timeline and FHIR representations of the same record count once. A passing result means the local rule is met. The API and workspace retain the unverified state in both cases.

## Engineering verification

On 2026-11-07, all 15 focused ingestion tests passed, including policy abstention and an uncited revision through the owner-scoped source response. Targeted ESLint, workspace type checking, and the optimized Next build passed. The live API returned an insufficient assessment and the signed-in Evidence sources page rendered it with the unverified label. The initial five-second browser assertion timed out. A response-aware check passed with HTTP 200.

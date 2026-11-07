# P11-F02 Typed tool registry

Chart review can retrieve source identifiers for a patient in the current tenant and facility when the caller authored a non-cancelled encounter for that patient. This local relationship rule uses existing synthetic encounter records. The tool reads only identifiers and returns at most 1,000. It checks the deadline before and after the local read and discards late or oversized results. SQLite reads are synchronous.

The agent manifest remains the authority for tool selection. Public tool calls inspect existing steps and cannot schedule or replay execution. Existing review approval remains a separate facility workflow.

The Agents page lists patients who meet the relationship rule. Run details and approval replays recheck the relationship before exposing stored source identifiers. A facility reviewer can still see review status. Tool and manifest denials use the existing audit stream, and successful source execution records an audit event without the source values or submitted payload. The registry reuses schema 62. Roll back the application build to revert the policy.

The agent and implementation checks passed seven top-level tests, including the implementation harness with 31 passing checks. Gateway boundary lint and web type checking passed. The isolated Playwright check confirmed that a clinician with a recorded encounter could see the source IDs and an unrelated reviewer could see the run status. Logs and a screenshot are in `artifacts/governance-v2/P11-F02`.

Qualified review of the encounter-based relationship rule and prerequisites for formal phase acceptance remain pending.

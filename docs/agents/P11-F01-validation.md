# P11-F01 Manifest and permission boundaries

The chart review workflow uses the existing versioned manifest row and a server-owned policy profile. The profile limits execution to the session facility and selected patient, treatment staff, chart source identifiers, and a separate human approval. It has no model or clinical write budget. The existing gateway probe profile can exercise the disabled gateway path with zero provider budget.

The agent input contract accepts a patient identifier. The tool boundary rejects unexpected fields and cross-patient requests. Output is limited to source identifiers or a gateway refusal receipt. Existing run and audit records follow the workspace retention policy. Unknown or broadened profiles fail closed. Runtime code grants no new tools, and policy rollback uses the previous application build.

Existing schema 62 rows are validated at use. The workspace exposes the chart review policy to chart roles and disables the start control when policy validation fails or the caller is ineligible. The API independently applies the policy. Execution validates the role, purpose, facility, registered tool list, model allowance, approval rule and bounded timeout and attempt counts. The gateway probe uses the existing disabled clinical prompt and receives a refusal receipt.

The focused agent and gateway suite passed 18 tests. It covered an injected tool payload, a stored manifest expanded to include note writing, continued denial of the gateway probe, and recovery of a pending approval from a reopened database. Gateway boundary lint and web type checking passed. Qualified review and prerequisite phase acceptance remain pending.

A signed-in Playwright check used an isolated synthetic database. The clinician saw the manifest permissions and started a chart review that waited for a second reviewer. Test logs and a screenshot are in `artifacts/governance-v2/P11-F01`.

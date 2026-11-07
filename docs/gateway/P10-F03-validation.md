# P10-F03 Prompt and model lifecycle

The local synthetic registry seals prompt and model versions in schema 60. Schema and fixture dispatch rules are validated at registration. The model version sets output character and citation limits. Gateway callers use the existing typed envelope and have no generation parameter overrides.

The registry records operator evaluation verdicts with synthetic evidence references. A version can serve a protected call only when the facility release alias resolves to the exact registered prompt and model pair, its latest evaluation passed, and the P10-F02 authorization checks pass. A failed reevaluation makes the pair ineligible immediately. An evaluation retry with the same reference and verdict returns the same evaluation ID.

An administrator can activate, disable, or roll back the facility alias through `/api/gateway/lifecycle`. The alias is an append-only history with optimistic revision checks. Rollback selects an earlier pair whose latest evaluation remains passing. Disable it by posting `evaluationId: null` with the current `expectedRevision`. The Gateway page displays the eligible pair, registered versions, evaluations, and alias history for an authorized facility. The existing clinical refusal path retains its original behavior.

## Operator contract

Use a signed-in local synthetic operations administrator from the facility's tenant. The role and tenant membership are rechecked in storage. An administrator with a facility assignment may manage that facility. Read with `GET /api/gateway/lifecycle?facility=FACILITY_ID`. Send a bounded JSON POST with `facilityId` and one action.

| Action | Additional fields |
| --- | --- |
| `register-prompt` | `id`, integer `version`, `name`, and `schema` containing `required`, `citationsMin`, and the P10-F02 `dispatchPolicy` |
| `register-model` | `id`, string `version`, `provider`, `maxOutputCharacters`, and `maxCitations` |
| `evaluate` | `promptId`, `promptVersion`, `modelId`, `modelVersion`, `verdict` and `evidenceRef` |
| `alias` | `expectedRevision` and the selected `evaluationId` or null |

An evaluation verdict is an operator's recorded synthetic assessment. Independent qualified evaluation and production release approval remain pending. Registry mutations are audited with scope metadata. Dispatch denials and invalid output continue to use the existing gateway attempt ledger.

## Storage and rollback

Migration 60 adds scoped registry, evaluation, and alias history tables. SQL guards block updates, deletion and replacement of sealed rows. Seeded disabled prompts and model metadata are preserved. An operator can roll back a release through the alias without altering database history. The migration failure scenario uses an isolated schema 59 fixture and verifies atomic retry with legacy records preserved.

## Verification

- The full domain suite passed 654 tests. After the final eligibility and SQL guard refinements, all 41 focused gateway and evidence tests passed.
- The optimized web build passed using a separate build directory and local synthetic configuration.
- Playwright passed the administrator registration and activation flow, clinician denial, and the Gateway page's response to a failed reevaluation. The test used an isolated schema 60 database with the standard demo tenant fixtures.

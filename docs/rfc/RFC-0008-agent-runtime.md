# RFC: Agent runtime

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Later phases need one place that checks an agent manifest before a tool runs. This slice needs that gate without a model and without a second workflow engine.

## Goals / non-goals
Goals: a versioned manifest, a tool registry, server-side permission checks, durable steps, a human approval that survives a restart, and an audit row for each run.

Non-goals: Temporal, a clinical copilot, generated note text, and chart writes from an agent.

## Data flow

```
session facility
    |
    v
startAgentRun
    |-- manifest allows the actor and the tool
    |-- chart source ids committed as a step
    |-- draft tool parks an approval row
    |
    v
awaiting-approval  (row survives a new database connection)
    |
    +-- same person --> refused
    +-- another person at the facility --> completed or refused
    |
    v
chart unchanged

A model tool, only when the manifest says gateway-only, calls invokeGateway and stores the trace id.
```

The HTTP route starts only the seeded chart-review agent. Organization and facility come from the session. Tool payloads cannot carry a facility, a database handle, or a URL.

## Proposed design
`POST /api/agents/run` starts `agt_chart_review` version 1. `POST /api/agents/approval` records approve or decline. The same idempotency key returns the same run. A running step that exceeds its attempt count or timeout is marked failed and does not invent a result.

## Security and privacy
Runs are listed for the session facility. A tool outside the manifest is denied and audited. Step output stores source identifiers, not result values or a narrative. Outbox payloads carry ids and status.

## Clinical hazards
Approval records a decision. It does not file a note, an order, or an evidence claim. The page says the chart was not changed.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Tool outside the manifest | Manifest list checked before the tool runs | `tool_note_write` is forbidden until the manifest includes it, and then it still does not write |
| Forged facility or URL in the tool payload | Sandbox rejects those fields | A `http://` patient id is rejected |
| Approval lost on restart | Approval row is committed | A reopened database still shows pending |
| Cross-organization run | Facility filter | Evan does not see the run |
| Model call around the gateway | Model tools call `invokeGateway` | Probe outcome is `refused` and the chart is unchanged |

## Rollback
Schema version 7 adds the agent tables. Stop the app and delete `data/curasphere.sqlite`.

## Tests
`npm test` covers manifest refusal, draft tools that do not write, idempotent replay, crash resume, a reopened database, attempt and timeout limits, gateway refusal, and organization isolation.

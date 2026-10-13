# RFC: Clinical timeline projection

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
A clinician needs one ordered view of the facility chart, and a list of what was stored after the last finished encounter, without a summary that adds facts.

## Goals / non-goals
Goals: one event per source row, a stable order, a visible source id, group filters, and a since-last-visit payload.

Non-goals: a stored timeline, model prose, care recommendations, and merging two facilities into one history.

## Data flow

```
session facility
    |
    v
source rows ----projectTimeline----> events (sourceId, sourceTable)
    |                                      |
    |                                      +-- filter by group --> chart and GET /api/patients/{id}/timeline
    |
    +-- latest finished encounter endedAt --> changes (same source ids)
```

The projection is not saved. Organization and facility come from the session inside the chart read.

## Proposed design
`projectTimeline` emits one event per encounter, problem, allergy, medication, observation, and appointment. Order is time descending, then event id. `filterTimeline` keeps one kind. `groupTimelineByDay` buckets the filtered list by the UTC date already on the event.

`GET /api/patients/{id}/timeline?group=` returns the filtered events, the day buckets, and `changes`. `group` is `all`, `results`, `encounters`, `problems`, `allergies`, `medications`, or `visits`. An unknown group is rejected. `since` is the end time of the latest finished encounter. `changes` lists open encounters plus observations and problems stored after that time. With no finished encounter, `changes` lists open encounters only.

The chart page uses the same functions. Each line links to `sourceTable` and `sourceId`. An empty group says the record is unchanged.

## Security and privacy
The read uses the chart query, so another facility and another organization get the same not-found body. The audit row for that miss is `patient.read`. A successful timeline read also writes `timeline.read`. Auditors are denied. The response is not cached.

## Clinical hazards
A filter can hide allergies or abnormal results from the list on screen. The page states that a group only hides other rows. The since-last-visit text is a template over source fields. It does not say what to do next. Abnormal observations keep the configured threshold phrase already stored on the row.

## Threats
| Threat | Mitigation | Test |
| --- | --- | --- |
| Cross-facility timeline | Chart facility filter | Evan receives an empty result |
| Auditor reconstruction | `canReadChart` | Priya is denied |
| Generated finding | Events are copies of source ids | Every change cites an event source |
| Unstable order | Sort by time, then id | Two reads deep-equal |

## Rollback
No schema change. The projection disappears with the source database. Stop the app and delete `data/curasphere.sqlite` to clear local rows.

## Tests
`npm test` covers a stable Elena projection, the results filter, an unknown group, and cross-facility and auditor denial.

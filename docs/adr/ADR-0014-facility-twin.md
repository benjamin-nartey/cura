# ADR-0014: Facility state is a projection of stored rows

Status: Accepted
Date: 2026-10-08

## Context
Phase 18 asks for beds, queues, staffing, appointments, lab backlog, pharmacy state, equipment, and capacity. This slice has no bed-management feed, staffing roster, or pharmacy system. Inventing a census, or letting a model rewrite a count, would be a production mock.

## Decision
Appointments, in-progress encounters, open lab orders, and proposed or active medication orders are counted from those tables. Beds, shifts, and equipment exist only when a clinician or nurse at the facility stores a row. Occupied beds require a patient on that facility. Shifts require a clinician or nurse already assigned to that facility. Capacity is the open share of stored beds and is not a forecast. Each signal carries `facility-sla-2026.10` and is marked not current when the build is older than that mark or the source is empty. A later lab, medication, bed, shift, or equipment event leaves the projection stale until rebuild. `holdFacilitySignal` ignores model output.

## Consequences
Schema version 14 adds the facility tables. There is no external operations feed. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed operations feed is connected. It still has to remain the source, and a model still cannot replace the count.

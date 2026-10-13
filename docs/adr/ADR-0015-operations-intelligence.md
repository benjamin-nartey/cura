# ADR-0015: Operations comparisons measure stored rows

Status: Accepted
Date: 2026-10-08

## Context
Phase 19 asks for wait-time analytics, capacity forecasts, inventory forecasts, staffing recommendations, and bottleneck detection. This slice has no arrival feed, issue history, or staffing system. A model-written forecast, or a count presented as a later census, would be a production mock.

## Decision
Wait age is the age of the oldest stored in-progress encounter at rebuild. Capacity is the open share of stored beds. Inventory is an on-hand count a clinician or nurse stores, and later use is not forecast when no issue history exists. Staffing compares rostered shifts with in-progress encounters. The bottleneck names the largest of those stored backlogs. Each sentence lists factors and a confidence of `none`, `low`, or `stored` from `ops-confidence-2026.10`. A hold is stored beside the sentence and does not replace it. KPI `ops-kpi-2026.10` keeps the first build as the baseline and reports the change in stored counts. `holdOperationsText` ignores model output.

## Consequences
Schema version 15 adds the operations tables. There is no forecast of occupancy, stock, or staffing. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed source supplies arrivals, issues, or a roster. The comparison still has to name those rows, and a model still cannot replace the sentence.

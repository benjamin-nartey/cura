# ADR-0017: Population counts stay above a minimum and name no person

Status: Accepted
Date: 2026-10-08

## Context
Phase 21 asks for cohorts, geospatial trends, disease surveillance, vaccination and chronic-disease dashboards, and privacy thresholds. This store has problem-list rows and results. It has no immunization table and no facility coordinates. A map, a vaccine registry, or a model-written outbreak would be a production mock.

## Decision
An auditor builds organization counts from stored rows. The chronic cohort uses the pinned codes `E11.9`, `I50.9`, `I10`, and `J45.909`. The systolic cohort counts distinct patients with LOINC `8480-6`. A cohort is shown only when the organization total is at least 5 and that total equals the sum of facility cells that are each at least 5. Otherwise the count, the codes, and the facility ids are omitted. Vaccination says no immunization rows are stored. The map says no coordinate is stored. Secondary use runs only when the organization tag is `local-synthetic` under `population-jurisdiction-2026.10`. `restricted` or a missing tag withholds every count. The tag is local configuration for this synthetic store, not a statute. The body is scanned for a patient name, MRN, or birth date before it is kept. A clinician cannot build or read the snapshot.

## Consequences
Schema version 17 adds `organizations.jurisdiction` and `population_state`. There is no map and no vaccination registry. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed jurisdiction decision and a real immunization source or coordinate source are connected. Counts below 5 still stay hidden, and a model still cannot write the cohort.

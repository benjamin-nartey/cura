# ADR-0003: Timeline is a read-time projection

Status: Accepted
Date: 2026-10-08

## Context
Phase 07 asks for a longitudinal timeline and a since-last-visit view before any model summary. The chart already stores encounters, problems, allergies, medications, observations, and appointments as source rows.

## Decision
The timeline is computed when the chart is read. Event ids are `tl-` plus the source id. Each event keeps `sourceTable` and `sourceId`. Groups filter that list. The since-last-visit list uses the latest finished encounter end time and includes only later observations, later problems, and open encounters. Nothing is written to a timeline table.

## Consequences
Re-reading the same source rows produces the same events. A group cannot add a fact. Deleting the database removes the source rows and the projection with them. A stored event log would be a second record and is out of scope.

## Revisit trigger
A client needs a timeline that survives source-row edits as its own legal record, or the projection becomes too large to compute on read.

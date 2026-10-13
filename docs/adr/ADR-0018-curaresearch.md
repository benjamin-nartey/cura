# ADR-0018: Research datasets freeze a count snapshot

Status: Accepted
Date: 2026-10-08

## Context
Phase 22 asks for a research workspace, ethics metadata, immutable dataset snapshots, de-identification, analysis exports, and provenance. This store has no ethics-board connection and no notebook runtime. Marking a protocol approved, or running an analysis notebook, would be a production mock.

## Decision
An auditor opens a workspace. The purpose stored on it is the session purpose, `AUDIT`. The ethics status is `not-reviewed`, and the note says that label is not an approval. A dataset version copies the stored population snapshot for that organization and is never updated. A later population build can add a new version. The previous payload stays. The copy is refused when the population build is missing, withheld, or contains a patient name, MRN, or birth date. An export starts `awaiting-approval`. The requester cannot approve it. A different auditor in the same organization can approve or decline. The approved body is the frozen payload. No notebook process is started.

## Consequences
Schema version 18 adds the research tables. An existing Harborlight directory receives Nabil Rahman on the next request so a second auditor can decide an export. A fresh seed already includes that user. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed ethics-board source is connected. The dataset row still stays immutable, and the requester still cannot approve their own export.

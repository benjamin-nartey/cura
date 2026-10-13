# ADR-0043: A proposed prescription is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0042 stored the lab result in PostgreSQL. Proposing a prescription still wrote the order and its safety warnings only in SQLite. Activating that order already copied the medication into the foundation service, so the proposal and the medication list could disagree.

## Decision
`POST /sessions/{id}/patients/{patientId}/prescriptions` stores a proposed order for a clinician or an admin. The dose is the text that was entered. The formulary id must be on pin `formulary-2026.10`. The server recomputes allergy, interaction, duplicate-therapy, and formulary warnings from pin `med-safety-2026.10` and the allergies and active medications already stored for that facility. The browser cannot supply those warnings. The same order id and warning ids are then stored in SQLite. If the foundation service is down, the clinic order is left unchanged. The outbox carries the ids, the formulary id, and the warning count. It does not copy the dose, the drug name, or the warning text. Kafka and Temporal are not started. The proposal does not diagnose, and a model cannot clear a warning.

## Consequences
A new proposal is stored in both databases after the foundation service is restarted with this change. A proposal that exists only in SQLite is unchanged. Recording the order on the medication list still updates the SQLite order and writes the medication. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
When that prescription is recorded on the medication list, update the foundation order. Acknowledgement of a warning still exists only in SQLite.

# ADR-0039: A device reading is copied onto the clinic observation list

Status: Accepted
Date: 2026-10-12

## Context
ADR-0038 stored a typed device reading as a foundation observation and left the device row in SQLite. The patient record and the SQLite timeline read the observation table, so that measurement stayed off both when the foundation service was down, and the patient record never showed it.

## Decision
After the foundation observation is stored, the same id is written to the clinic observation list. The device reading, alert, and escalation stay in SQLite. A device reading that has no observation with the same code, value, and time is included on the SQLite timeline and the patient record. The display, unit, and threshold come from the facility catalog. The foundation outbox still does not copy the numeric value. If the foundation service is down, a new reading is not stored. No device stream is connected, and no page is sent. Kafka and Temporal are not started. The row does not diagnose.

## Consequences
A new typed reading appears on the foundation timeline, the SQLite timeline, and the patient record after the web app reloads. A reading stored only as a device row before this copy stays on the SQLite chart and the patient record, and stays off the phone until it is entered again. Rollback is to stop the web app. Do not delete the SQLite file for this change.

## Revisit trigger
Record the next chart writer that still exists only in SQLite.

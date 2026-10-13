# ADR-0038: A device reading is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0037 left a typed device reading in SQLite. The timeline reads observations from the foundation database, so that measurement stayed off the chart and the phone.

## Decision
The device page checks the device, the catalog pin, the value, and the reading time on the server. It then records an observation in the foundation service at that time, and stores the device reading, alert, and escalation in SQLite. The display and unit come from the facility catalog. A time more than a day ahead is refused. If the foundation service is down, the reading is not stored. The outbox does not copy the numeric value. No device stream is connected, and no page is sent. Kafka and Temporal are not started. The row does not diagnose.

## Consequences
A typed device reading appears on the foundation timeline at the time that was entered, after the foundation service is restarted with this change. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record the next measurement that still exists only in SQLite.

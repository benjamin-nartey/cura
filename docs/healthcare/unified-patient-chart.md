# Unified patient chart

Experimental clinician workspace for P04-F05. The chart reads existing master, clinical source, scheduling, work, and billing modules. It does not create a second patient master.

## Route

`/patients/{id}/chart` with optional `?encounter=`.

## Sections

Identity header, active encounter, allergies, problems, observations, medication drafts, pending work, orders/plans/referrals, encounter history, and billing status or charge list when authorized.

Missing sections stay empty. Unknown allergy status is not treated as no known allergies. Medication drafts remain labeled non-executable. Closed encounters keep ordinary clinical edits denied through existing source and work gates.

## Patient context

Each chart load verifies the requested patient against the session tenant and facility. Superseded patients show a link to the surviving record. Pending work is filtered by the selected patient. Partial section failures are listed without fabricating findings. Switching patients requires a new request for the new id.

On mobile, the chart appears before workspace navigation, which remains available through the Navigation link. Blood-pressure components show their values and units; observations retain effective timestamps and source versions. Billing and this experimental chart require the four local synthetic override variables.

## Safety states

Loading, empty chart, no encounter, permission denied, superseded patient, closed encounter, conflict, and section failure are shown as truthful messages. No AI summary is generated.

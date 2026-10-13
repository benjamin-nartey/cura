# Runbook — local foundation

## Start

```bash
npm install
npm test
npm run dev
bash services/foundation/run.sh bootRun
```

Open http://localhost:3000. The directory, the workforce session, the patient list, open encounters, appointments, problems, allergies, medications, and the latest-results list come from PostgreSQL. The timeline and the patient state still come from SQLite. Facility cannot be switched from the page. A session older than 12 hours is refused.

## Health

`GET /api/health` returns `{ "ok": true, "schemaVersion": 26, "foundation": { "ok": true, "schemaVersion": 14, "store": "postgresql" } }`. The patients page, open encounters, today's appointments, the problem list, allergies, medications, and the latest-results list read the foundation service. A synthetic clinic day is seeded for 2026-10-08. A lab order is stored in the foundation service, then copied to SQLite. A specimen is stored against that order in the foundation service, then copied to SQLite. A lab result records the observation and the result row in the foundation service, then copies both to SQLite. A critical result also stores an alert there. Acknowledgement of that alert is stored in the foundation service, then copied to SQLite. The critical flag stays on the result. A proposed prescription is stored in the foundation service, then copied to SQLite. Recording that prescription stores the medication in the foundation service and marks the foundation order active. A dispense is stored in the foundation service, then copied to SQLite. An administration is stored in the foundation service, then copied to SQLite. Acknowledgement of a warning is stored in the foundation service, then copied to SQLite. Its severity is unchanged. Nothing was billed. A problem, an allergy, and a medication recorded from a prescription are stored in the foundation service, then copied to SQLite. A FHIR Observation is stored the same way. A typed device reading is stored as an observation at the time that was entered, then that same observation is copied to SQLite. A reading that has no matching observation stays on the SQLite timeline and the patient record. The device row stays in SQLite. The mobile app calls the foundation service directly. The foundation object is `{ "ok": false, "schemaVersion": null, "store": "postgresql" }` when the Kotlin service is down. `GET http://127.0.0.1:8081/health` is the service itself.

Chart rollback: stop the app and delete `data/curasphere.sqlite` (and its wal, shm, and journal files). Foundation rollback: stop the Kotlin process and drop the local `curasphere` database. Do not delete the SQLite file to roll back the foundation service.

The observation catalog is a pinned subset: LOINC 2.78, UCUM 2.2, and local binding `facility-vitals-2026.10`. Problem list rows cite ICD-10-CM 2026. Lakeside Hospital does not include the cardiac-marker value set, so BNP cannot be recorded there.

`GET /api/patients/{id}/timeline?group=results` returns the read-time projection for the session facility. `group` may be `all`, `results`, `encounters`, `problems`, `allergies`, `medications`, or `visits`. `changes` lists what was stored after the latest finished encounter. The chart page uses the same groups.

`GET /api/patients/{id}/state` returns the latest patient-state build for the session facility, including `builtAt` and `stale`. Rebuild from the chart. The deterioration slot stays unfilled.

`GET /api/patients/{id}/evidence` returns the claims filed by that rebuild. Each claim cites a source row. A changed source is returned as `invalidated`.

The model gateway is at `/gateway`. Clinical generation is closed. Attempts store a hash of the redacted input, a trace id, and model `mdl_none` version `0`.

The agent runtime is at `/agents`. Chart review stores source identifiers and parks until a different person at the facility approves or declines. Approval does not change the chart.

The copilot is on the patient chart. Its grounding threshold is 1: the summary appears only when every stored claim is supported. A question is answered only with those claim texts. Feedback does not change the chart.

Documentation sits on the same chart. Consent is required. Clinician text becomes a draft of source quotes. Audio retention defaults to 0 hours, and audio is not transcribed. Accept and reject do not sign the draft or change the chart. Schema version 9 adds the documentation tables.

The lab card is on the same chart. A clinician places an order. A clinician or nurse collects the specimen and records the value. The reference range and code-system versions are copied from the facility pin. Critical alerts use `lab-critical-2026.10` and are not cleared by the gateway. Schema version 10 adds the lab tables.

The prescription card is on the same chart. Safety warnings store rule `med-safety-2026.10` and source `local-pin`. A high-risk warning blocks the medication-list write until it is acknowledged, and the gateway cannot clear it. Schema version 11 adds the prescription tables.

Coordination sits on the chart and at `/coordination`. Templates are English and Spanish. A message is stored only when consent is granted and the channel is the facility record. Otherwise an escalation task opens and nothing is sent. Schema version 12 adds the coordination tables.

The patient record is at `/portal`. Elena Voss and Mateo Ruiz each have a principal. The session cannot open the clinician chart. Result sentences use `patient-explain-2026.10`. Urgent phrases store an instruction to call local emergency services. A visit request is not a booking until the facility accepts it, and a payment row stays recorded. Schema version 13 adds the patient-record tables.

The facility projection is at `/facility`. Appointments, the open encounter queue, lab backlog, and pharmacy backlog are counted from those source tables. Beds, shifts, and equipment are rows a clinician or nurse stores. Each signal shows `facility-sla-2026.10` and whether the build is still inside that mark. A later lab or medication event leaves the projection stale until rebuild. Schema version 14 adds the facility tables. The next request applies them.

Operations comparisons are at `/operations`. Wait age, capacity, staffing, and the largest backlog are calculated from stored rows. An on-hand count is stored only when someone records it, and it is not a forecast of later use. Each sentence shows factors and confidence `ops-confidence-2026.10`. A hold does not change the sentence. KPI `ops-kpi-2026.10` keeps the first build as the baseline. Schema version 15 adds the operations tables.

The analytics mart is at `/analytics` for an auditor. Ingest copies that organization's outbox into a separate table and drops every payload field except a facility id. Export uses `analytics-metrics-2026.10`. Cells below 5 are suppressed, and the body is scanned for a patient name, MRN, or birth date. Schema version 16 adds the analytics tables.

Population counts are at `/population` for an auditor. The jurisdiction tag must be `local-synthetic` or every count is withheld. Chronic problems and recorded systolic results are shown only when the group is at least 5 and no smaller facility remainder would be implied. Vaccination and map sentences say those sources are not stored. Schema version 17 adds the jurisdiction column and `population_state`. An existing database does not receive a tag until an auditor stores one.

Research workspaces are at `/research` for an auditor. The ethics status stays `not-reviewed`. A dataset version copies the stored population build and is not updated. An export waits until a different auditor approves it. No analysis notebook runs. Schema version 18 adds the research tables. An existing Harborlight directory receives Nabil Rahman on the next request. A fresh seed already includes that user.

Imaging metadata is at `/imaging` for a clinician or nurse. A study stores an accession, a pinned modality, a study date, and a short description. Payloads over 1024 characters are refused. No DICOMweb endpoint is connected, and no image viewer is connected. A typed report can be linked to one study. A release keeps modality and study date and omits the patient, accession, and description. The gateway refuses an interpretation. Schema version 19 adds the imaging tables.

Device readings are at `/devices` for a clinician or nurse. A device stays `not-connected`. A reading stores the facility catalog code and unit. The same time and value returns the existing row. An earlier time is marked out-of-order and does not open a threshold mark. At most 3 marks stay open; the next crossing stores an escalation sentence and sends no page. Readings are not copied into chart observations. Schema version 20 adds the device tables.

The revenue ledger is at `/revenue` for Harborlight Admin. Amounts stay recorded. Eligibility stays not-checked. A claim stays a draft after a submit attempt. No denial is calculated. A plan label stays not-billed. The reconciliation sentence adds recorded payments and the unpaid remainder. The page does not show problems or results. Schema version 21 adds the revenue tables. An existing Harborlight directory receives Harborlight Admin on the next request.

Evaluation is at `/evaluation` for an auditor. The golden set `eval-golden-2026.10` expects every case to be refused by the gateway. A second auditor can sign a hold. A promotion attempt stays `not-promoted`, and `mdl_none` stays disabled. Subgroup and drift sentences say those measures are not calculated. Each run stores the gate that was in place. Schema version 22 adds the evaluation tables.

Enterprise controls are at `/enterprise` for Harborlight Admin. The only residency value is `local-sqlite`. Federation stays not connected. No customer key is stored. A drill reads this database and records failover as `not-run`. Recovery point and failover time are not calculated. An API grant uses the directory session. A tenant is not moved. Schema version 23 adds the enterprise tables. A fresh seed pins both organizations. An existing database stays unpinned until an admin stores the pin.

Marketplace listings are at `/marketplace` for Harborlight Admin and the Harborlight auditors. A listing scope stays `health.read` and the risk class stays administrative. An auditor stores a hold. The listing is not released. A share stays not-billed. Stop does not signal a process. OAuth clients and sandbox tenants are refused. Schema version 24 adds the marketplace tables. No listing is seeded.

The release train is at `/release-train` for a Harborlight auditor. The strategy stays not-approved. A dossier stores no clinical claim. The trace cites ADR-0022, RFC-0023, and R28. The risk file stays unsigned. Verification is a gateway refusal. Clinical evaluation stays not-performed. The change plan stays not-authorized. Surveillance stays not-active and counts stored gateway refusals. A different auditor records the attempt as not-released. The author cannot record it. Schema version 25 adds the release-train tables. No dossier is seeded.

Module cards are at `/modules` for a Harborlight auditor. The catalog is imaging, ECG, pathology, dermatology, maternal, cardio, and oncology. Each code has its own intended-use sentence and model card. A stored module stays not-cleared. A different auditor records a gateway refusal for that module. A workflow study stays not-run. Performance stays not-calculated. Approving every module is refused. Schema version 26 adds the module tables. No module is seeded.

## Tenant file copy

Stop the app. Copy `data/curasphere.sqlite` and any `data/curasphere.sqlite-*` files to a backup on this machine. Start the app with that same file. Do not treat the copy as another region. The product refuses a tenant move.

`GET /api/fhir/r4/metadata` is the R4 conformance statement. Chart reads and the facility export use the directory session. SMART on FHIR is not accepted. Observation subscriptions store notifications in the local inbox.

## Who can see what

- Amira Solano and Jordan Hale: Riverside Clinic at Harborlight Health.
- Lea Okonkwo: East Annex at Harborlight. She must not see Riverside patients.
- Priya Raman and Nabil Rahman: Harborlight auditors. Chart pages are denied. Audit, analytics, population, research, evaluation, marketplace, the release train, and module cards are allowed.
- Harborlight Admin: organization ledger, enterprise controls, and marketplace listings. Chart pages are denied. Revenue, enterprise, and marketplace are allowed.
- Evan Cho: Lakeside at Northwind Medical. A different organization.
- Elena Voss and Mateo Ruiz: patient principals at Riverside. Each session sees only that person's record.

## Audit

Access rows are in `audit_events`. Inspect with any SQLite browser, or:

```bash
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; const db = new DatabaseSync('data/curasphere.sqlite'); console.log(db.prepare('select created_at, action, outcome, resource_type from audit_events order by created_at desc limit 20').all());"
```

Do not paste row contents that you have replaced with real data into chat or tickets.

## Rollback

1. Stop `npm run dev`.
2. Delete `data/curasphere.sqlite` and any `data/curasphere.sqlite-*` files.
3. Start again. The seed is recreated. Local registrations are gone.

There is no hosted rollout in this slice.

## Production flag

Set `CURASPHERE_ENV=production` only to prove the directory refuses to open. This slice has no production identity provider to fall back on.

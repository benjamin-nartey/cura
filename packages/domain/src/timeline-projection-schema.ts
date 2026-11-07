import { TIMELINE_QUERY_FIXTURE_ROLLBACK } from "./timeline-query-schema";
export const TIMELINE_PROJECTION_SCHEMA=`
CREATE TABLE timeline_outbox (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, ledger_id TEXT NOT NULL UNIQUE REFERENCES source_versions(id),
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 kind TEXT NOT NULL, source_version INTEGER NOT NULL, contract_version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','applied','dead-letter','rebuilt')),
 diagnostic TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 resolved_run TEXT, created_at TEXT NOT NULL
);
CREATE INDEX timeline_outbox_scope ON timeline_outbox(organization_id,facility_id,patient_id,status,source_version,seq);
CREATE TRIGGER timeline_outbox_pointer_immutable BEFORE UPDATE OF ledger_id,organization_id,facility_id,patient_id,kind,source_version,contract_version,created_at ON timeline_outbox BEGIN SELECT RAISE(ABORT,'timeline pointer is immutable'); END;
CREATE TRIGGER timeline_outbox_no_delete BEFORE DELETE ON timeline_outbox BEGIN SELECT RAISE(ABORT,'timeline evidence is immutable'); END;
CREATE TABLE timeline_projection_events (
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 event_id TEXT NOT NULL, ledger_id TEXT NOT NULL REFERENCES source_versions(id), kind TEXT NOT NULL,
 event_json TEXT NOT NULL, PRIMARY KEY(organization_id,facility_id,patient_id,event_id),
 UNIQUE(organization_id,facility_id,patient_id,ledger_id)
);
CREATE TABLE timeline_projection_runs (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, command_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 result_json TEXT NOT NULL, recorded_at TEXT NOT NULL,
 UNIQUE(organization_id,facility_id,patient_id,actor_id,command_key)
);
CREATE TRIGGER timeline_runs_no_update BEFORE UPDATE ON timeline_projection_runs BEGIN SELECT RAISE(ABORT,'timeline run is immutable'); END;
CREATE TRIGGER timeline_runs_no_delete BEFORE DELETE ON timeline_projection_runs BEGIN SELECT RAISE(ABORT,'timeline run is immutable'); END;
${[ ['condition','source_conditions'],['allergy','source_allergies'],['observation','source_observations'],['medication-order','source_medication_orders'] ].map(([kind,table])=>`
CREATE TRIGGER timeline_enqueue_${kind.replaceAll('-','_')} AFTER INSERT ON source_versions WHEN NEW.record_kind='${kind}' BEGIN
 INSERT INTO timeline_outbox(ledger_id,organization_id,facility_id,patient_id,kind,source_version,created_at)
 SELECT NEW.id,NEW.organization_id,NEW.facility_id,s.patient_id,NEW.record_kind,NEW.version,NEW.recorded_at FROM ${table} s
 WHERE s.id=NEW.record_id AND s.organization_id=NEW.organization_id AND s.facility_id=NEW.facility_id;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'timeline source pointer unavailable') END;
END;
INSERT INTO timeline_outbox(ledger_id,organization_id,facility_id,patient_id,kind,source_version,created_at)
 SELECT v.id,v.organization_id,v.facility_id,s.patient_id,v.record_kind,v.version,v.recorded_at
 FROM source_versions v JOIN ${table} s ON s.id=v.record_id AND s.organization_id=v.organization_id AND s.facility_id=v.facility_id
 WHERE v.record_kind='${kind}' ORDER BY v.version,v.id;
`).join('')}
`;

// Destructive disposable-fixture helper only. Operational rollback retains all evidence.
export const TIMELINE_PROJECTION_FIXTURE_ROLLBACK=`${TIMELINE_QUERY_FIXTURE_ROLLBACK} DROP TRIGGER IF EXISTS timeline_enqueue_condition; DROP TRIGGER IF EXISTS timeline_enqueue_allergy; DROP TRIGGER IF EXISTS timeline_enqueue_observation; DROP TRIGGER IF EXISTS timeline_enqueue_medication_order; DROP TABLE IF EXISTS timeline_projection_runs; DROP TABLE IF EXISTS timeline_projection_events; DROP TABLE IF EXISTS timeline_outbox; DELETE FROM schema_migrations WHERE version=52;`;

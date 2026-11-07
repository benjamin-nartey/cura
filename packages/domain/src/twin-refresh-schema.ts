import {EVIDENCE_GRAPH_FIXTURE_ROLLBACK} from "./evidence-graph-schema";
export const TWIN_REFRESH_SCHEMA=`
CREATE TABLE twin_refresh_jobs(
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'),coverage TEXT NOT NULL,mode TEXT NOT NULL CHECK(mode IN('refresh','repair')),
 status TEXT NOT NULL CHECK(status IN('queued','running','succeeded','failed','cancelled')),attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),
 phase TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,lease_until INTEGER,lease_token TEXT,
 result_build TEXT REFERENCES twin_state_builds(id),error_code TEXT,
 CHECK((status='running' AND lease_until IS NOT NULL AND lease_token IS NOT NULL) OR (status!='running' AND lease_until IS NULL AND lease_token IS NULL))
);
CREATE INDEX twin_refresh_scope ON twin_refresh_jobs(organization_id,facility_id,patient_id,actor_id,purpose,coverage,created_at);
CREATE UNIQUE INDEX twin_refresh_active ON twin_refresh_jobs(organization_id,facility_id,patient_id,actor_id,purpose,coverage) WHERE status IN('queued','running');
CREATE TABLE twin_refresh_commands(organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_key TEXT NOT NULL,request_hash TEXT NOT NULL,job_id TEXT NOT NULL REFERENCES twin_refresh_jobs(id),recorded_at TEXT NOT NULL,PRIMARY KEY(organization_id,facility_id,patient_id,actor_id,command_key));
CREATE TABLE twin_refresh_events(id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES twin_refresh_jobs(id),attempt INTEGER NOT NULL CHECK(attempt BETWEEN 0 AND 3),state TEXT NOT NULL,phase TEXT NOT NULL,recorded_at TEXT NOT NULL,error_code TEXT);
CREATE INDEX twin_refresh_event_job ON twin_refresh_events(job_id,recorded_at);
CREATE TABLE twin_refresh_checkpoints(id TEXT PRIMARY KEY,job_id TEXT NOT NULL UNIQUE REFERENCES twin_refresh_jobs(id),build_id TEXT NOT NULL REFERENCES twin_state_builds(id),source_hash TEXT NOT NULL CHECK(length(source_hash)=64),state_hash TEXT NOT NULL CHECK(length(state_hash)=64),policy_version TEXT NOT NULL CHECK(policy_version='source-check-v1'),verified_at TEXT NOT NULL);
CREATE TRIGGER twin_refresh_identity BEFORE UPDATE ON twin_refresh_jobs WHEN NEW.id IS NOT OLD.id OR NEW.organization_id IS NOT OLD.organization_id OR NEW.facility_id IS NOT OLD.facility_id OR NEW.patient_id IS NOT OLD.patient_id OR NEW.actor_id IS NOT OLD.actor_id OR NEW.purpose IS NOT OLD.purpose OR NEW.coverage IS NOT OLD.coverage OR NEW.mode IS NOT OLD.mode OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'refresh identity is immutable'); END;
CREATE TRIGGER twin_refresh_no_delete BEFORE DELETE ON twin_refresh_jobs BEGIN SELECT RAISE(ABORT,'refresh evidence is immutable'); END;
${['commands','events','checkpoints'].map(table=>`CREATE TRIGGER twin_refresh_${table}_update BEFORE UPDATE ON twin_refresh_${table} BEGIN SELECT RAISE(ABORT,'refresh evidence is immutable'); END;CREATE TRIGGER twin_refresh_${table}_delete BEFORE DELETE ON twin_refresh_${table} BEGIN SELECT RAISE(ABORT,'refresh evidence is immutable'); END;`).join('')}
`;
// Disposable fixtures only; operational rollback retains job/build/source evidence.
export const TWIN_REFRESH_FIXTURE_ROLLBACK=`${EVIDENCE_GRAPH_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS twin_refresh_checkpoints;DROP TABLE IF EXISTS twin_refresh_events;DROP TABLE IF EXISTS twin_refresh_commands;DROP TABLE IF EXISTS twin_refresh_jobs;DELETE FROM schema_migrations WHERE version=57;`;

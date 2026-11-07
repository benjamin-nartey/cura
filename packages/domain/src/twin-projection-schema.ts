import { TWIN_CONFLICT_FIXTURE_ROLLBACK } from "./twin-conflict-schema";
export const TWIN_PROJECTION_SCHEMA=`
CREATE TABLE twin_state_builds (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'),coverage TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),
 schema_version INTEGER NOT NULL CHECK(schema_version=1),rules_version TEXT NOT NULL CHECK(rules_version='twin-source-v1'),
 source_hash TEXT NOT NULL CHECK(length(source_hash)=64),state_hash TEXT NOT NULL CHECK(length(state_hash)=64),state_json TEXT NOT NULL,
 source_through_at TEXT,processed_at TEXT NOT NULL,
 UNIQUE(organization_id,facility_id,patient_id,actor_id,version)
);
CREATE INDEX twin_state_scope ON twin_state_builds(organization_id,facility_id,patient_id,actor_id,purpose,coverage,version);
CREATE TABLE twin_state_commands (
 organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,build_id TEXT NOT NULL REFERENCES twin_state_builds(id),recorded_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,facility_id,patient_id,actor_id,command_key)
);
CREATE TRIGGER twin_build_no_update BEFORE UPDATE ON twin_state_builds BEGIN SELECT RAISE(ABORT,'twin build is immutable'); END;
CREATE TRIGGER twin_build_no_delete BEFORE DELETE ON twin_state_builds BEGIN SELECT RAISE(ABORT,'twin build is immutable'); END;
CREATE TRIGGER twin_command_no_update BEFORE UPDATE ON twin_state_commands BEGIN SELECT RAISE(ABORT,'twin command is immutable'); END;
CREATE TRIGGER twin_command_no_delete BEFORE DELETE ON twin_state_commands BEGIN SELECT RAISE(ABORT,'twin command is immutable'); END;
`;
// Disposable fixtures only. Retain all state/evidence during operational rollback.
export const TWIN_PROJECTION_FIXTURE_ROLLBACK=`${TWIN_CONFLICT_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS twin_state_commands;DROP TABLE IF EXISTS twin_state_builds;DELETE FROM schema_migrations WHERE version=55;`;

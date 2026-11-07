import { TWIN_REFRESH_FIXTURE_ROLLBACK } from "./twin-refresh-schema";
export const TWIN_CONFLICT_SCHEMA=`
CREATE TABLE twin_review_requests (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'),coverage TEXT NOT NULL,issue_id TEXT NOT NULL CHECK(length(issue_id)=64),
 issue_kind TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN('conflict','uncertainty')),
 build_id TEXT NOT NULL REFERENCES twin_state_builds(id),source_hash TEXT NOT NULL CHECK(length(source_hash)=64),state_hash TEXT NOT NULL CHECK(length(state_hash)=64),
 source_ids_json TEXT NOT NULL CHECK(length(source_ids_json)<=100000),requested_by TEXT NOT NULL,requested_at TEXT NOT NULL,
 target TEXT NOT NULL CHECK(target='clinical-source-verification'),status TEXT NOT NULL CHECK(status='open'),
 UNIQUE(organization_id,facility_id,patient_id,purpose,coverage,issue_id)
);
CREATE INDEX twin_review_scope ON twin_review_requests(organization_id,facility_id,patient_id,purpose,coverage,requested_at);
CREATE TABLE twin_review_commands (
 organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,command_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,request_id TEXT NOT NULL REFERENCES twin_review_requests(id),recorded_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,facility_id,patient_id,actor_id,command_key)
);
CREATE TRIGGER twin_review_no_update BEFORE UPDATE ON twin_review_requests BEGIN SELECT RAISE(ABORT,'review evidence is immutable'); END;
CREATE TRIGGER twin_review_no_delete BEFORE DELETE ON twin_review_requests BEGIN SELECT RAISE(ABORT,'review evidence is immutable'); END;
CREATE TRIGGER twin_review_command_no_update BEFORE UPDATE ON twin_review_commands BEGIN SELECT RAISE(ABORT,'review receipt is immutable'); END;
CREATE TRIGGER twin_review_command_no_delete BEFORE DELETE ON twin_review_commands BEGIN SELECT RAISE(ABORT,'review receipt is immutable'); END;
`;
// Disposable fixtures only. Operational rollback retains all source/review evidence.
export const TWIN_CONFLICT_FIXTURE_ROLLBACK=`${TWIN_REFRESH_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS twin_review_commands;DROP TABLE IF EXISTS twin_review_requests;DELETE FROM schema_migrations WHERE version=56;`;

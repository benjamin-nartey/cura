import { TWIN_EVIDENCE_FIXTURE_ROLLBACK } from "./twin-evidence-schema";
export const TIMELINE_QUERY_SCHEMA=`
CREATE TABLE timeline_snapshots (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), coverage TEXT NOT NULL,
 command_key TEXT NOT NULL, source_hash TEXT NOT NULL, captured_at TEXT NOT NULL, member_count INTEGER NOT NULL CHECK(member_count BETWEEN 0 AND 500), member_hash TEXT NOT NULL,
 UNIQUE(organization_id,facility_id,patient_id,actor_id,command_key)
);
CREATE INDEX timeline_snapshot_owner ON timeline_snapshots(organization_id,facility_id,patient_id,actor_id,captured_at);
CREATE TABLE timeline_snapshot_members (
 snapshot_id TEXT NOT NULL REFERENCES timeline_snapshots(id), kind TEXT NOT NULL, record_id TEXT NOT NULL,
 ledger_id TEXT NOT NULL REFERENCES source_versions(id), source_version INTEGER NOT NULL CHECK(source_version>0),
 source_sha TEXT NOT NULL CHECK(length(source_sha)=64), PRIMARY KEY(snapshot_id,kind,record_id)
);
CREATE TRIGGER timeline_snapshots_no_update BEFORE UPDATE ON timeline_snapshots BEGIN SELECT RAISE(ABORT,'timeline snapshot is immutable'); END;
CREATE TRIGGER timeline_snapshots_no_delete BEFORE DELETE ON timeline_snapshots BEGIN SELECT RAISE(ABORT,'timeline snapshot is immutable'); END;
CREATE TRIGGER timeline_members_no_update BEFORE UPDATE ON timeline_snapshot_members BEGIN SELECT RAISE(ABORT,'timeline snapshot member is immutable'); END;
CREATE TRIGGER timeline_members_no_delete BEFORE DELETE ON timeline_snapshot_members BEGIN SELECT RAISE(ABORT,'timeline snapshot member is immutable'); END;
`;
// Disposable fixtures only. Operational rollback retains snapshot/source evidence.
export const TIMELINE_QUERY_FIXTURE_ROLLBACK=`${TWIN_EVIDENCE_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS timeline_snapshot_members; DROP TABLE IF EXISTS timeline_snapshots; DELETE FROM schema_migrations WHERE version=53;`;

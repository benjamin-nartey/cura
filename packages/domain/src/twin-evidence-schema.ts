import { TWIN_PROJECTION_FIXTURE_ROLLBACK } from "./twin-projection-schema";
export const TWIN_EVIDENCE_SCHEMA=`
CREATE TABLE twin_evidence_manifests (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,facility_id TEXT NOT NULL,patient_id TEXT NOT NULL,actor_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'),coverage TEXT NOT NULL,command_key TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),source_hash TEXT NOT NULL CHECK(length(source_hash)=64),captured_at TEXT NOT NULL,
 member_count INTEGER NOT NULL CHECK(member_count BETWEEN 0 AND 1000),member_hash TEXT NOT NULL CHECK(length(member_hash)=64),
 UNIQUE(organization_id,facility_id,patient_id,actor_id,command_key),UNIQUE(organization_id,facility_id,patient_id,actor_id,version)
);
CREATE TABLE twin_evidence_members (
 manifest_id TEXT NOT NULL REFERENCES twin_evidence_manifests(id),fact_id TEXT NOT NULL CHECK(length(fact_id)=64),kind TEXT NOT NULL,record_id TEXT NOT NULL,
 clinical_ledger TEXT REFERENCES source_versions(id),work_ledger TEXT REFERENCES work_versions(id),
 source_version INTEGER NOT NULL CHECK(source_version>0),source_sha TEXT NOT NULL CHECK(length(source_sha)=64),recorded_at TEXT NOT NULL,
 CHECK((clinical_ledger IS NOT NULL AND work_ledger IS NULL) OR (clinical_ledger IS NULL AND work_ledger IS NOT NULL)),
 PRIMARY KEY(manifest_id,fact_id),UNIQUE(manifest_id,kind,record_id)
);
CREATE INDEX twin_evidence_scope ON twin_evidence_manifests(organization_id,facility_id,patient_id,actor_id,version);
CREATE TRIGGER twin_manifest_no_update BEFORE UPDATE ON twin_evidence_manifests BEGIN SELECT RAISE(ABORT,'twin manifest is immutable'); END;
CREATE TRIGGER twin_manifest_no_delete BEFORE DELETE ON twin_evidence_manifests BEGIN SELECT RAISE(ABORT,'twin manifest is immutable'); END;
CREATE TRIGGER twin_member_no_update BEFORE UPDATE ON twin_evidence_members BEGIN SELECT RAISE(ABORT,'twin member is immutable'); END;
CREATE TRIGGER twin_member_no_delete BEFORE DELETE ON twin_evidence_members BEGIN SELECT RAISE(ABORT,'twin member is immutable'); END;
`;
// Disposable fixtures only. Operational rollback preserves evidence.
export const TWIN_EVIDENCE_FIXTURE_ROLLBACK=`${TWIN_PROJECTION_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS twin_evidence_members;DROP TABLE IF EXISTS twin_evidence_manifests;DELETE FROM schema_migrations WHERE version=54;`;

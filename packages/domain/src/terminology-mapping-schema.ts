export const TERMINOLOGY_MAPPING_SCHEMA = `
CREATE TABLE terminology_mappings (
 id TEXT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 source_release_id TEXT NOT NULL,
 source_concept_id TEXT NOT NULL,
 target_release_id TEXT NOT NULL,
 target_concept_id TEXT NOT NULL,
 mapping_version TEXT NOT NULL CHECK(length(mapping_version) BETWEEN 1 AND 100),
 equivalence TEXT NOT NULL CHECK(equivalence IN ('equivalent','broader','narrower','related')),
 active_from TEXT NOT NULL CHECK(date(active_from) IS NOT NULL AND date(active_from)=active_from),
 active_to TEXT CHECK(active_to IS NULL OR (date(active_to) IS NOT NULL AND date(active_to)=active_to AND active_to>active_from)),
 source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
 rationale TEXT NOT NULL CHECK(length(rationale) BETWEEN 10 AND 1000),
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),
 proposed_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 FOREIGN KEY(source_release_id,source_concept_id) REFERENCES terminology_release_concepts(release_id,concept_id),
 FOREIGN KEY(target_release_id,target_concept_id) REFERENCES terminology_release_concepts(release_id,concept_id),
 UNIQUE(organization_id,source_release_id,source_concept_id,target_release_id,target_concept_id,mapping_version)
);
CREATE TABLE terminology_mapping_reviews (
 id TEXT PRIMARY KEY,
 mapping_id TEXT NOT NULL REFERENCES terminology_mappings(id),
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 reviewer_id TEXT NOT NULL REFERENCES users(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','revoked')),
 version INTEGER NOT NULL CHECK(version>=2),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 created_at TEXT NOT NULL,
 UNIQUE(mapping_id,version)
);
CREATE TABLE terminology_mapping_commands (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 command_key TEXT NOT NULL,
 request_hash TEXT NOT NULL,
 mapping_id TEXT NOT NULL REFERENCES terminology_mappings(id),
 response_json TEXT NOT NULL,
 PRIMARY KEY(organization_id,command_key)
);
CREATE VIEW terminology_mapping_state AS
 SELECT m.*,COALESCE(r.decision,'pending') status,COALESCE(r.version,1) version,r.reviewer_id,r.reason review_reason,r.created_at reviewed_at
 FROM terminology_mappings m LEFT JOIN terminology_mapping_reviews r ON r.mapping_id=m.id
 AND r.version=(SELECT MAX(e.version) FROM terminology_mapping_reviews e WHERE e.mapping_id=m.id);
CREATE INDEX terminology_mapping_scope ON terminology_mappings(organization_id,source_release_id,source_concept_id,target_release_id,mapping_version);
CREATE TRIGGER terminology_mapping_scope_guard BEFORE INSERT ON terminology_mappings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_releases s JOIN terminology_releases t ON t.organization_id=s.organization_id
   WHERE s.id=NEW.source_release_id AND t.id=NEW.target_release_id AND s.organization_id=NEW.organization_id
   AND s.rights_kind='synthetic' AND t.rights_kind='synthetic') THEN RAISE(ABORT,'mapping scope or content is restricted') END;
END;
CREATE TRIGGER terminology_mapping_review_guard BEFORE INSERT ON terminology_mapping_reviews BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_mapping_state m WHERE m.id=NEW.mapping_id AND m.organization_id=NEW.organization_id
   AND m.proposed_by<>NEW.reviewer_id AND NEW.version=m.version+1
   AND ((m.status='pending' AND NEW.decision IN ('approved','rejected')) OR (m.status='approved' AND NEW.decision='revoked')))
   THEN RAISE(ABORT,'invalid independent review transition') END;
END;
CREATE TRIGGER terminology_mapping_command_guard BEFORE INSERT ON terminology_mapping_commands BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_mappings m WHERE m.id=NEW.mapping_id AND m.organization_id=NEW.organization_id)
   THEN RAISE(ABORT,'mapping command scope mismatch') END;
END;
CREATE TRIGGER terminology_mapping_no_update BEFORE UPDATE ON terminology_mappings BEGIN SELECT RAISE(ABORT,'mapping is immutable'); END;
CREATE TRIGGER terminology_mapping_no_delete BEFORE DELETE ON terminology_mappings BEGIN SELECT RAISE(ABORT,'mapping is immutable'); END;
CREATE TRIGGER terminology_mapping_review_no_update BEFORE UPDATE ON terminology_mapping_reviews BEGIN SELECT RAISE(ABORT,'mapping review is immutable'); END;
CREATE TRIGGER terminology_mapping_review_no_delete BEFORE DELETE ON terminology_mapping_reviews BEGIN SELECT RAISE(ABORT,'mapping review is immutable'); END;
CREATE TRIGGER terminology_mapping_command_no_update BEFORE UPDATE ON terminology_mapping_commands BEGIN SELECT RAISE(ABORT,'mapping receipt is immutable'); END;
CREATE TRIGGER terminology_mapping_command_no_delete BEFORE DELETE ON terminology_mapping_commands BEGIN SELECT RAISE(ABORT,'mapping receipt is immutable'); END;
`;

// Disposable test fixtures only. Operational rollback preserves all records.
export const TERMINOLOGY_MAPPING_FIXTURE_ROLLBACK = `
${FACILITY_CATALOG_FIXTURE_ROLLBACK}
DROP VIEW IF EXISTS terminology_mapping_state;
DROP TABLE IF EXISTS terminology_mapping_commands;
DROP TABLE IF EXISTS terminology_mapping_reviews;
DROP TABLE IF EXISTS terminology_mappings;
DELETE FROM schema_migrations WHERE version=46;
`;
import { FACILITY_CATALOG_FIXTURE_ROLLBACK } from "./facility-catalog-schema";

export const FACILITY_CATALOG_SCHEMA = `
CREATE TABLE facility_catalog_versions (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),facility_id TEXT REFERENCES facilities(id),
 scope_key TEXT NOT NULL CHECK(scope_key=COALESCE(facility_id,'organization')),
 catalog_key TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>=1),base_version_id TEXT REFERENCES facility_catalog_versions(id),
 release_id TEXT NOT NULL,concept_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('drug','test','procedure')),
 order_category TEXT CHECK(order_category IN ('laboratory','imaging','nursing')),
 display TEXT NOT NULL CHECK(length(display) BETWEEN 2 AND 200),unit_code TEXT NOT NULL,unit_pack_version TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','inactive','retired')),
 active_from TEXT NOT NULL CHECK(date(active_from) IS NOT NULL AND date(active_from)=active_from),
 active_to TEXT CHECK(active_to IS NULL OR (date(active_to) IS NOT NULL AND date(active_to)=active_to AND active_to>active_from)),
 source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),source_note TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64),created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
 FOREIGN KEY(release_id,concept_id) REFERENCES terminology_release_concepts(release_id,concept_id),
 UNIQUE(organization_id,scope_key,catalog_key,revision),
 CHECK((kind='drug' AND order_category IS NULL) OR (kind='test' AND order_category='laboratory') OR (kind='procedure' AND order_category IN ('imaging','nursing'))),
 CHECK((facility_id IS NULL AND base_version_id IS NULL) OR (facility_id IS NOT NULL AND base_version_id IS NOT NULL))
);
CREATE TABLE facility_catalog_heads (
 organization_id TEXT NOT NULL REFERENCES organizations(id),scope_key TEXT NOT NULL,catalog_key TEXT NOT NULL,
 version_id TEXT NOT NULL REFERENCES facility_catalog_versions(id),revision INTEGER NOT NULL,
 PRIMARY KEY(organization_id,scope_key,catalog_key)
);
CREATE TABLE facility_catalog_commands (
 organization_id TEXT NOT NULL REFERENCES organizations(id),command_key TEXT NOT NULL,request_hash TEXT NOT NULL,
 version_id TEXT NOT NULL REFERENCES facility_catalog_versions(id),response_json TEXT NOT NULL,PRIMARY KEY(organization_id,command_key)
);
CREATE TABLE work_order_catalog_pins (
 order_id TEXT PRIMARY KEY REFERENCES work_orders(id),organization_id TEXT NOT NULL REFERENCES organizations(id),facility_id TEXT NOT NULL REFERENCES facilities(id),
 entry_version_id TEXT NOT NULL REFERENCES facility_catalog_versions(id),snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX facility_catalog_lookup ON facility_catalog_versions(organization_id,catalog_key,scope_key,revision);
CREATE TRIGGER facility_catalog_version_scope BEFORE INSERT ON facility_catalog_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_releases r WHERE r.id=NEW.release_id AND r.organization_id=NEW.organization_id AND r.rights_kind='synthetic')
  OR (NEW.facility_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM facilities f WHERE f.id=NEW.facility_id AND f.organization_id=NEW.organization_id))
  OR (NEW.base_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM facility_catalog_versions b JOIN facility_catalog_heads h ON h.version_id=b.id WHERE b.id=NEW.base_version_id AND b.organization_id=NEW.organization_id AND b.facility_id IS NULL AND b.catalog_key=NEW.catalog_key AND b.release_id=NEW.release_id AND b.concept_id=NEW.concept_id AND b.kind=NEW.kind AND b.order_category IS NEW.order_category))
  THEN RAISE(ABORT,'catalog scope or base identity mismatch') END;
END;
CREATE TRIGGER facility_catalog_head_insert BEFORE INSERT ON facility_catalog_heads BEGIN
 SELECT CASE WHEN NEW.revision<>1 OR NOT EXISTS(SELECT 1 FROM facility_catalog_versions v WHERE v.id=NEW.version_id AND v.organization_id=NEW.organization_id AND v.scope_key=NEW.scope_key AND v.catalog_key=NEW.catalog_key AND v.revision=NEW.revision)
 THEN RAISE(ABORT,'invalid catalog head') END;
END;
CREATE TRIGGER facility_catalog_head_update BEFORE UPDATE ON facility_catalog_heads BEGIN
 SELECT CASE WHEN NEW.organization_id<>OLD.organization_id OR NEW.scope_key<>OLD.scope_key OR NEW.catalog_key<>OLD.catalog_key OR NEW.revision<>OLD.revision+1
 OR NOT EXISTS(SELECT 1 FROM facility_catalog_versions v WHERE v.id=NEW.version_id AND v.organization_id=NEW.organization_id AND v.scope_key=NEW.scope_key AND v.catalog_key=NEW.catalog_key AND v.revision=NEW.revision)
 THEN RAISE(ABORT,'invalid catalog head transition') END;
END;
CREATE TRIGGER facility_catalog_head_no_delete BEFORE DELETE ON facility_catalog_heads BEGIN SELECT RAISE(ABORT,'catalog head cannot be removed'); END;
CREATE TRIGGER work_order_catalog_scope BEFORE INSERT ON work_order_catalog_pins BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_orders o JOIN facility_catalog_versions v ON v.id=NEW.entry_version_id JOIN terminology_releases r ON r.id=v.release_id JOIN code_systems s ON s.id=r.code_system_id JOIN concepts c ON c.id=v.concept_id
 WHERE o.id=NEW.order_id AND o.organization_id=NEW.organization_id AND o.facility_id=NEW.facility_id AND v.organization_id=o.organization_id AND (v.facility_id IS NULL OR v.facility_id=o.facility_id)
 AND v.kind<>'drug' AND o.code=c.code AND o.code_system=s.uri AND o.code_system_version=s.version AND o.display=v.display AND o.category=v.order_category)
 THEN RAISE(ABORT,'order catalog pin mismatch') END;
END;
CREATE TRIGGER facility_catalog_no_update BEFORE UPDATE ON facility_catalog_versions BEGIN SELECT RAISE(ABORT,'catalog version is immutable'); END;
CREATE TRIGGER facility_catalog_no_delete BEFORE DELETE ON facility_catalog_versions BEGIN SELECT RAISE(ABORT,'catalog version is immutable'); END;
CREATE TRIGGER facility_catalog_command_no_update BEFORE UPDATE ON facility_catalog_commands BEGIN SELECT RAISE(ABORT,'catalog receipt is immutable'); END;
CREATE TRIGGER facility_catalog_command_no_delete BEFORE DELETE ON facility_catalog_commands BEGIN SELECT RAISE(ABORT,'catalog receipt is immutable'); END;
CREATE TRIGGER work_catalog_pin_no_update BEFORE UPDATE ON work_order_catalog_pins BEGIN SELECT RAISE(ABORT,'order catalog pin is immutable'); END;
CREATE TRIGGER work_catalog_pin_no_delete BEFORE DELETE ON work_order_catalog_pins BEGIN SELECT RAISE(ABORT,'order catalog pin is immutable'); END;
`;
// Disposable fixtures only. Retain all immutable records for operational rollback.
export const FACILITY_CATALOG_FIXTURE_ROLLBACK = `
${CLINICAL_CODING_FIXTURE_ROLLBACK}
DROP TABLE IF EXISTS work_order_catalog_pins;
DROP TABLE IF EXISTS facility_catalog_commands;
DROP TABLE IF EXISTS facility_catalog_heads;
DROP TABLE IF EXISTS facility_catalog_versions;
DELETE FROM schema_migrations WHERE version=47;
`;
import { CLINICAL_CODING_FIXTURE_ROLLBACK } from "./clinical-coding-schema";

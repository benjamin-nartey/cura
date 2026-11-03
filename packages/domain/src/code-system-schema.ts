export const CODE_SYSTEM_REGISTRY_SCHEMA = `
CREATE TABLE terminology_releases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  code_system_id TEXT NOT NULL REFERENCES code_systems(id),
  edition TEXT NOT NULL CHECK(length(edition) BETWEEN 1 AND 100),
  active_from TEXT NOT NULL CHECK(date(active_from) IS NOT NULL AND date(active_from) = active_from),
  active_to TEXT CHECK(active_to IS NULL OR (date(active_to) IS NOT NULL AND date(active_to) = active_to AND active_to > active_from)),
  rights_kind TEXT NOT NULL CHECK(rights_kind IN ('synthetic','reference-only')),
  source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
  source_note TEXT NOT NULL CHECK(length(source_note) BETWEEN 10 AND 500),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64 AND manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(organization_id, code_system_id)
);
CREATE TABLE terminology_release_concepts (
  release_id TEXT NOT NULL REFERENCES terminology_releases(id),
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  PRIMARY KEY(release_id, concept_id)
);
CREATE TABLE terminology_registry_commands (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES terminology_releases(id),
  PRIMARY KEY(organization_id, command_key)
);
CREATE TABLE terminology_registry_controls (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO terminology_registry_controls (name, value) VALUES ('dependency','available');
CREATE TRIGGER terminology_pins_authorized BEFORE INSERT ON terminology_release_concepts BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_releases r JOIN concepts c ON c.code_system_id = r.code_system_id JOIN code_systems s ON s.id = r.code_system_id
    WHERE r.id = NEW.release_id AND c.id = NEW.concept_id AND r.rights_kind = 'synthetic'
      AND substr(s.uri,1,length('urn:curasphere:synthetic:' || r.organization_id || ':')) = 'urn:curasphere:synthetic:' || r.organization_id || ':')
    OR EXISTS(SELECT 1 FROM terminology_registry_commands WHERE release_id = NEW.release_id)
    THEN RAISE(ABORT,'release content is restricted or sealed') END;
END;
CREATE INDEX terminology_releases_org ON terminology_releases(organization_id, active_from, code_system_id);
CREATE TRIGGER terminology_releases_no_update BEFORE UPDATE ON terminology_releases BEGIN SELECT RAISE(ABORT,'terminology release is immutable'); END;
CREATE TRIGGER terminology_releases_no_delete BEFORE DELETE ON terminology_releases BEGIN SELECT RAISE(ABORT,'terminology release is immutable'); END;
CREATE TRIGGER terminology_pins_no_update BEFORE UPDATE ON terminology_release_concepts BEGIN SELECT RAISE(ABORT,'terminology pin is immutable'); END;
CREATE TRIGGER terminology_pins_no_delete BEFORE DELETE ON terminology_release_concepts BEGIN SELECT RAISE(ABORT,'terminology pin is immutable'); END;
CREATE TRIGGER terminology_commands_no_update BEFORE UPDATE ON terminology_registry_commands BEGIN SELECT RAISE(ABORT,'terminology receipt is immutable'); END;
CREATE TRIGGER terminology_commands_no_delete BEFORE DELETE ON terminology_registry_commands BEGIN SELECT RAISE(ABORT,'terminology receipt is immutable'); END;
CREATE TRIGGER terminology_systems_frozen_update BEFORE UPDATE ON code_systems WHEN EXISTS(SELECT 1 FROM terminology_releases WHERE code_system_id = OLD.id) BEGIN SELECT RAISE(ABORT,'registered code system is immutable'); END;
CREATE TRIGGER terminology_systems_frozen_delete BEFORE DELETE ON code_systems WHEN EXISTS(SELECT 1 FROM terminology_releases WHERE code_system_id = OLD.id) BEGIN SELECT RAISE(ABORT,'registered code system is immutable'); END;
CREATE TRIGGER terminology_concepts_frozen_update BEFORE UPDATE ON concepts WHEN EXISTS(SELECT 1 FROM terminology_release_concepts WHERE concept_id = OLD.id) BEGIN SELECT RAISE(ABORT,'registered concept is immutable'); END;
CREATE TRIGGER terminology_concepts_frozen_delete BEFORE DELETE ON concepts WHEN EXISTS(SELECT 1 FROM terminology_release_concepts WHERE concept_id = OLD.id) BEGIN SELECT RAISE(ABORT,'registered concept is immutable'); END;
`;

// Disposable-fixture rollback only. Operational rollback retains receipts and uses prior application routes.
export const CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK = `
${TERMINOLOGY_MAPPING_FIXTURE_ROLLBACK}
DROP TABLE IF EXISTS terminology_value_set_commands;
DROP TABLE IF EXISTS terminology_value_set_members;
DROP TABLE IF EXISTS terminology_value_sets;
DELETE FROM schema_migrations WHERE version = 45;
DROP TRIGGER IF EXISTS terminology_systems_frozen_update;
DROP TRIGGER IF EXISTS terminology_systems_frozen_delete;
DROP TRIGGER IF EXISTS terminology_concepts_frozen_update;
DROP TRIGGER IF EXISTS terminology_concepts_frozen_delete;
DROP TABLE IF EXISTS terminology_registry_commands;
DROP TABLE IF EXISTS terminology_release_concepts;
DROP TABLE IF EXISTS terminology_releases;
DROP TABLE IF EXISTS terminology_registry_controls;
DELETE FROM schema_migrations WHERE version = 44;
`;

export const TERMINOLOGY_VALIDATION_SCHEMA = `
CREATE TABLE terminology_value_sets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  version TEXT NOT NULL CHECK(length(version) BETWEEN 1 AND 100),
  manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256) = 64),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE(organization_id,name,version)
);
CREATE TABLE terminology_value_set_members (
  value_set_id TEXT NOT NULL REFERENCES terminology_value_sets(id),
  release_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  PRIMARY KEY(value_set_id,release_id,concept_id),
  FOREIGN KEY(release_id,concept_id) REFERENCES terminology_release_concepts(release_id,concept_id)
);
CREATE TABLE terminology_value_set_commands (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  value_set_id TEXT NOT NULL REFERENCES terminology_value_sets(id),
  PRIMARY KEY(organization_id,command_key)
);
CREATE TRIGGER terminology_set_members_authorized BEFORE INSERT ON terminology_value_set_members BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM terminology_value_sets v JOIN terminology_releases r ON r.organization_id = v.organization_id
   WHERE v.id = NEW.value_set_id AND r.id = NEW.release_id AND r.rights_kind = 'synthetic')
   OR EXISTS(SELECT 1 FROM terminology_value_set_commands WHERE value_set_id = NEW.value_set_id)
   THEN RAISE(ABORT,'value set is restricted or sealed') END;
END;
CREATE TRIGGER terminology_sets_no_update BEFORE UPDATE ON terminology_value_sets BEGIN SELECT RAISE(ABORT,'value set is immutable'); END;
CREATE TRIGGER terminology_sets_no_delete BEFORE DELETE ON terminology_value_sets BEGIN SELECT RAISE(ABORT,'value set is immutable'); END;
CREATE TRIGGER terminology_members_no_update BEFORE UPDATE ON terminology_value_set_members BEGIN SELECT RAISE(ABORT,'value set member is immutable'); END;
CREATE TRIGGER terminology_members_no_delete BEFORE DELETE ON terminology_value_set_members BEGIN SELECT RAISE(ABORT,'value set member is immutable'); END;
CREATE TRIGGER terminology_set_commands_no_update BEFORE UPDATE ON terminology_value_set_commands BEGIN SELECT RAISE(ABORT,'value set receipt is immutable'); END;
CREATE TRIGGER terminology_set_commands_no_delete BEFORE DELETE ON terminology_value_set_commands BEGIN SELECT RAISE(ABORT,'value set receipt is immutable'); END;
`;
import { TERMINOLOGY_MAPPING_FIXTURE_ROLLBACK } from "./terminology-mapping-schema";

export const CLINICAL_CODING_SCHEMA = `
CREATE TABLE clinical_coding_definitions (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),kind TEXT NOT NULL CHECK(kind IN ('condition','allergy','observation','medication-order','work-order')),
 system TEXT NOT NULL,version TEXT NOT NULL,code TEXT NOT NULL,display TEXT NOT NULL,revision TEXT NOT NULL CHECK(length(revision)=64),definition_json TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(organization_id,kind,revision),UNIQUE(organization_id,id)
);
CREATE TABLE clinical_coding_pins (
 organization_id TEXT NOT NULL REFERENCES organizations(id),facility_id TEXT NOT NULL REFERENCES facilities(id),kind TEXT NOT NULL,resource_id TEXT NOT NULL,
 definition_id TEXT NOT NULL,recorded_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,kind,resource_id),FOREIGN KEY(organization_id,definition_id) REFERENCES clinical_coding_definitions(organization_id,id)
);
CREATE TRIGGER clinical_coding_pin_guard BEFORE INSERT ON clinical_coding_pins BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM clinical_coding_definitions d WHERE d.id=NEW.definition_id AND d.organization_id=NEW.organization_id AND d.kind=NEW.kind AND (
  (NEW.kind='condition' AND EXISTS(SELECT 1 FROM source_conditions r WHERE r.id=NEW.resource_id AND r.organization_id=NEW.organization_id AND r.facility_id=NEW.facility_id AND r.code=d.code AND r.code_system=d.system AND r.code_system_version=d.version AND r.display=d.display)) OR
  (NEW.kind='allergy' AND EXISTS(SELECT 1 FROM source_allergies r WHERE r.id=NEW.resource_id AND r.organization_id=NEW.organization_id AND r.facility_id=NEW.facility_id AND r.code=d.code AND r.code_system=d.system AND r.code_system_version=d.version AND r.display=d.display)) OR
  (NEW.kind='observation' AND EXISTS(SELECT 1 FROM source_observations r WHERE r.id=NEW.resource_id AND r.organization_id=NEW.organization_id AND r.facility_id=NEW.facility_id AND r.code=d.code AND r.code_system=d.system AND r.code_system_version=d.version AND r.display=d.display)) OR
  (NEW.kind='medication-order' AND EXISTS(SELECT 1 FROM source_medication_orders r WHERE r.id=NEW.resource_id AND r.organization_id=NEW.organization_id AND r.facility_id=NEW.facility_id AND r.code=d.code AND r.code_system=d.system AND r.code_system_version=d.version AND r.display=d.display)) OR
  (NEW.kind='work-order' AND EXISTS(SELECT 1 FROM work_orders r WHERE r.id=NEW.resource_id AND r.organization_id=NEW.organization_id AND r.facility_id=NEW.facility_id AND r.code=d.code AND r.code_system=d.system AND r.code_system_version=d.version AND r.display=d.display))))
 THEN RAISE(ABORT,'coding pin does not match the scoped source tuple') END;
END;
CREATE TRIGGER clinical_definition_no_update BEFORE UPDATE ON clinical_coding_definitions BEGIN SELECT RAISE(ABORT,'coding definition is immutable'); END;
CREATE TRIGGER clinical_definition_no_delete BEFORE DELETE ON clinical_coding_definitions BEGIN SELECT RAISE(ABORT,'coding definition is immutable'); END;
CREATE TRIGGER clinical_coding_pin_no_update BEFORE UPDATE ON clinical_coding_pins BEGIN SELECT RAISE(ABORT,'coding pin is immutable'); END;
CREATE TRIGGER clinical_coding_pin_no_delete BEFORE DELETE ON clinical_coding_pins BEGIN SELECT RAISE(ABORT,'coding pin is immutable'); END;
${[
 ["condition","source_conditions"],["allergy","source_allergies"],["observation","source_observations"],["medication-order","source_medication_orders"],["work-order","work_orders"],
].map(([kind,table])=>`CREATE TRIGGER coding_${kind.replaceAll("-","_")}_identity BEFORE UPDATE OF code,code_system,code_system_version,display ON ${table}
 WHEN EXISTS(SELECT 1 FROM clinical_coding_pins p WHERE p.kind='${kind}' AND p.resource_id=OLD.id AND p.organization_id=OLD.organization_id)
 AND (NEW.code<>OLD.code OR NEW.code_system<>OLD.code_system OR NEW.code_system_version<>OLD.code_system_version OR NEW.display<>OLD.display)
 BEGIN SELECT RAISE(ABORT,'pinned coded identity is immutable'); END;`).join("\n")}
`;
// Disposable fixtures only; operational rollback preserves all definitions and pins.
export const CLINICAL_CODING_FIXTURE_ROLLBACK = `${SMART_FIXTURE_ROLLBACK} ${["condition","allergy","observation","medication_order","work_order"].map(kind=>`DROP TRIGGER IF EXISTS coding_${kind}_identity;`).join("\n")} DROP TABLE IF EXISTS clinical_coding_pins; DROP TABLE IF EXISTS clinical_coding_definitions; DELETE FROM schema_migrations WHERE version=48;`;
import { SMART_FIXTURE_ROLLBACK } from "./smart-schema";

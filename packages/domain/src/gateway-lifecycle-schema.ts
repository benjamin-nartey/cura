export const GATEWAY_LIFECYCLE_SCHEMA = `
CREATE TABLE gateway_registry_versions (
 kind TEXT NOT NULL CHECK(kind IN ('prompt','model')),
 id TEXT NOT NULL, version TEXT NOT NULL,
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(kind,id,version)
);
CREATE TABLE gateway_evaluations (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 prompt_id TEXT NOT NULL, prompt_version INTEGER NOT NULL,
 model_id TEXT NOT NULL, model_version TEXT NOT NULL,
 verdict TEXT NOT NULL CHECK(verdict IN ('passed','failed')),
 evidence_ref TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(organization_id,facility_id,prompt_id,prompt_version,model_id,model_version,evidence_ref)
);
CREATE INDEX gateway_evaluation_pair ON gateway_evaluations(organization_id,facility_id,prompt_id,prompt_version,model_id,model_version);
CREATE TABLE gateway_release_alias_events (
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0),
 evaluation_id TEXT REFERENCES gateway_evaluations(id),
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,facility_id,revision)
);
${['gateway_registry_versions','gateway_evaluations','gateway_release_alias_events'].map(table => `
CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table}
BEGIN SELECT RAISE(ABORT,'Gateway lifecycle history is immutable'); END;
CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table}
BEGIN SELECT RAISE(ABORT,'Gateway lifecycle history is immutable'); END;
`).join('')}
CREATE TRIGGER gateway_registry_versions_no_replace BEFORE INSERT ON gateway_registry_versions
WHEN EXISTS (SELECT 1 FROM gateway_registry_versions WHERE kind=NEW.kind AND id=NEW.id AND version=NEW.version)
BEGIN SELECT RAISE(ABORT,'Gateway lifecycle history is immutable'); END;
CREATE TRIGGER gateway_evaluations_no_replace BEFORE INSERT ON gateway_evaluations
WHEN EXISTS (SELECT 1 FROM gateway_evaluations WHERE id=NEW.id
 OR (organization_id=NEW.organization_id AND facility_id=NEW.facility_id AND prompt_id=NEW.prompt_id
 AND prompt_version=NEW.prompt_version AND model_id=NEW.model_id AND model_version=NEW.model_version
 AND evidence_ref=NEW.evidence_ref))
BEGIN SELECT RAISE(ABORT,'Gateway lifecycle history is immutable'); END;
CREATE TRIGGER gateway_release_alias_events_no_replace BEFORE INSERT ON gateway_release_alias_events
WHEN EXISTS (SELECT 1 FROM gateway_release_alias_events
 WHERE organization_id=NEW.organization_id AND facility_id=NEW.facility_id AND revision=NEW.revision)
BEGIN SELECT RAISE(ABORT,'Gateway lifecycle history is immutable'); END;
${[['gateway_prompts','prompt'],['gateway_models','model']].map(([table,kind]) => `
CREATE TRIGGER ${table}_sealed_update BEFORE UPDATE ON ${table}
WHEN EXISTS (SELECT 1 FROM gateway_registry_versions WHERE kind='${kind}'
 AND ((id=OLD.id AND version=CAST(OLD.version AS TEXT)) OR (id=NEW.id AND version=CAST(NEW.version AS TEXT))))
BEGIN SELECT RAISE(ABORT,'Registered gateway version is immutable'); END;
CREATE TRIGGER ${table}_sealed_delete BEFORE DELETE ON ${table}
WHEN EXISTS (SELECT 1 FROM gateway_registry_versions WHERE kind='${kind}' AND id=OLD.id AND version=CAST(OLD.version AS TEXT))
BEGIN SELECT RAISE(ABORT,'Registered gateway version is immutable'); END;
CREATE TRIGGER ${table}_sealed_insert BEFORE INSERT ON ${table}
WHEN EXISTS (SELECT 1 FROM gateway_registry_versions WHERE kind='${kind}' AND id=NEW.id AND version=CAST(NEW.version AS TEXT))
BEGIN SELECT RAISE(ABORT,'Registered gateway version is immutable'); END;
`).join('')}
`;

export const GATEWAY_LIFECYCLE_FIXTURE_ROLLBACK = `
DROP TRIGGER IF EXISTS gateway_prompts_sealed_update;
DROP TRIGGER IF EXISTS gateway_prompts_sealed_delete;
DROP TRIGGER IF EXISTS gateway_prompts_sealed_insert;
DROP TRIGGER IF EXISTS gateway_models_sealed_update;
DROP TRIGGER IF EXISTS gateway_models_sealed_delete;
DROP TRIGGER IF EXISTS gateway_models_sealed_insert;
DROP TABLE IF EXISTS gateway_release_alias_events;
DROP TABLE IF EXISTS gateway_evaluations;
DROP TABLE IF EXISTS gateway_registry_versions;
DROP TABLE IF EXISTS agent_execution_controls;
DROP TABLE IF EXISTS gateway_trace_metadata;
DROP TABLE gateway_dispatch_units;
DROP TABLE gateway_circuits;
DELETE FROM schema_migrations WHERE version IN (60,61,62,63);
`;

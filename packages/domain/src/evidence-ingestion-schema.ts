export const EVIDENCE_INGESTION_SCHEMA=`
CREATE TABLE graph_documents (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), coverage TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160), content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 8000),
 effective_at TEXT, recorded_at TEXT NOT NULL, version INTEGER NOT NULL CHECK(version=1), sha256 TEXT NOT NULL CHECK(length(sha256)=64)
);
CREATE INDEX graph_document_scope ON graph_documents(organization_id,facility_id,patient_id,owner_id,purpose,coverage);
CREATE TABLE graph_source_edges (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES graph_claims(id), revision_id TEXT NOT NULL REFERENCES graph_claim_revisions(id),
 relationship TEXT NOT NULL CHECK(relationship IN('supported','contradicting','insufficient')),
 source_format TEXT NOT NULL CHECK(source_format IN('timeline','fhir-r4','local-document')),
 source_id TEXT NOT NULL, source_json TEXT NOT NULL CHECK(json_valid(source_json)),
 recorded_at TEXT NOT NULL, sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 UNIQUE(revision_id,source_format,source_id)
);
CREATE TABLE graph_ingestion_commands (
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), command_key TEXT NOT NULL, coverage TEXT NOT NULL,
 request_hash TEXT NOT NULL CHECK(length(request_hash)=64), result_id TEXT NOT NULL,
 PRIMARY KEY(organization_id,facility_id,patient_id,owner_id,purpose,command_key)
);
${['graph_documents','graph_source_edges','graph_ingestion_commands'].map(t=>`
CREATE TRIGGER ${t}_immutable_update BEFORE UPDATE ON ${t} BEGIN SELECT RAISE(ABORT,'graph ingestion is immutable'); END;
CREATE TRIGGER ${t}_immutable_delete BEFORE DELETE ON ${t} BEGIN SELECT RAISE(ABORT,'graph ingestion is immutable'); END;`).join('')}
`;
import {GATEWAY_LIFECYCLE_FIXTURE_ROLLBACK} from "./gateway-lifecycle-schema";
export const EVIDENCE_INGESTION_FIXTURE_ROLLBACK=`${GATEWAY_LIFECYCLE_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS graph_ingestion_commands;DROP TABLE IF EXISTS graph_source_edges;DROP TABLE IF EXISTS graph_documents;DELETE FROM schema_migrations WHERE version=59;`;

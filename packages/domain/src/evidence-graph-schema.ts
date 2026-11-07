import {EVIDENCE_INGESTION_FIXTURE_ROLLBACK} from "./evidence-ingestion-schema";
// Additive derived storage. Source tables and legacy evidence contracts are unchanged.
export const EVIDENCE_GRAPH_SCHEMA=`
CREATE TABLE graph_claims (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), coverage TEXT NOT NULL CHECK(json_valid(coverage)),
 created_at TEXT NOT NULL
);
CREATE INDEX graph_claim_scope ON graph_claims(organization_id,facility_id,patient_id,owner_id,purpose,coverage);
CREATE TABLE graph_claim_revisions (
 id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES graph_claims(id), version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 100),
 claim_type TEXT NOT NULL CHECK(claim_type IN('source-assertion','hypothesis','care-gap-question','risk-question')),
 claim_text TEXT NOT NULL CHECK(length(trim(claim_text)) BETWEEN 1 AND 2000),
 evidence_state TEXT NOT NULL CHECK(evidence_state='unverified'),
 author_id TEXT NOT NULL, author_kind TEXT NOT NULL CHECK(author_kind='human'),
 model_name TEXT CHECK(model_name IS NULL), model_version TEXT CHECK(model_version IS NULL),
 recorded_at TEXT NOT NULL, source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
 citation_count INTEGER NOT NULL CHECK(citation_count BETWEEN 0 AND 12), payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 UNIQUE(claim_id,version)
);
CREATE TABLE graph_claim_sources (
 revision_id TEXT NOT NULL REFERENCES graph_claim_revisions(id), fact_id TEXT NOT NULL CHECK(length(fact_id)=64),
 relationship TEXT NOT NULL CHECK(relationship='cites'), kind TEXT NOT NULL, record_id TEXT NOT NULL,
 clinical_ledger TEXT REFERENCES source_versions(id), work_ledger TEXT REFERENCES work_versions(id),
 source_version INTEGER NOT NULL CHECK(source_version>0), source_sha TEXT NOT NULL CHECK(length(source_sha)=64), recorded_at TEXT NOT NULL,
 CHECK((clinical_ledger IS NOT NULL AND work_ledger IS NULL) OR (clinical_ledger IS NULL AND work_ledger IS NOT NULL)),
 PRIMARY KEY(revision_id,fact_id)
);
CREATE TABLE graph_claim_commands (
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, patient_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), coverage TEXT NOT NULL,
 command_key TEXT NOT NULL, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
 claim_id TEXT NOT NULL REFERENCES graph_claims(id), revision_id TEXT NOT NULL REFERENCES graph_claim_revisions(id),
 PRIMARY KEY(organization_id,facility_id,patient_id,owner_id,purpose,command_key)
);
${['graph_claims','graph_claim_revisions','graph_claim_sources','graph_claim_commands'].map(table=>`
CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'graph evidence is immutable'); END;
CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'graph evidence is immutable'); END;
`).join('')}
`;
// Disposable fixtures only. Operational rollback retains all evidence and disables this feature's UI.
export const EVIDENCE_GRAPH_FIXTURE_ROLLBACK=`${EVIDENCE_INGESTION_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS graph_claim_commands;DROP TABLE IF EXISTS graph_claim_sources;DROP TABLE IF EXISTS graph_claim_revisions;DROP TABLE IF EXISTS graph_claims;DELETE FROM schema_migrations WHERE version=58;`;

import { INTEGRATION_BATCH_FIXTURE_ROLLBACK } from "./integration-batch-schema";
// Additive local exchange schema. No legacy inbox or clinical rows are rewritten.
export const INTEGRATION_SCHEMA = `
CREATE TABLE integration_connections (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 name TEXT NOT NULL, endpoint TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 version INTEGER NOT NULL CHECK(version>0), registration_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(organization_id,registration_key), UNIQUE(id,organization_id,facility_id)
);
CREATE TABLE integration_links (
 id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 external_patient TEXT NOT NULL, external_encounter TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES patients(id),
 encounter_id TEXT NOT NULL REFERENCES visit_encounters(id), created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 FOREIGN KEY(connection_id,organization_id,facility_id) REFERENCES integration_connections(id,organization_id,facility_id),
 UNIQUE(connection_id,external_patient,external_encounter), UNIQUE(id,connection_id)
);
CREATE TABLE integration_inbox (
 id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES integration_connections(id),
 message_id TEXT NOT NULL, body_hash TEXT NOT NULL, payload TEXT NOT NULL,
 external_id TEXT, external_version INTEGER, content_hash TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','applied','quarantined','rejected')),
 diagnostic TEXT NOT NULL, received_at INTEGER NOT NULL, reviewed_by TEXT, reviewed_at INTEGER,
 source_id TEXT, source_version INTEGER, UNIQUE(connection_id,message_id)
);
CREATE UNIQUE INDEX integration_inbox_version ON integration_inbox(connection_id,external_id,external_version) WHERE status IN ('pending','applied');
CREATE TABLE integration_aliases (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id), message_id TEXT NOT NULL,
 body_hash TEXT NOT NULL, receipt_id TEXT NOT NULL REFERENCES integration_inbox(id),
 PRIMARY KEY(connection_id,message_id)
);
CREATE TABLE integration_heads (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id), external_id TEXT NOT NULL,
 external_version INTEGER NOT NULL, source_id TEXT NOT NULL REFERENCES source_observations(id),
 source_version INTEGER NOT NULL, link_id TEXT NOT NULL REFERENCES integration_links(id),
 PRIMARY KEY(connection_id,external_id)
);
CREATE TABLE integration_subscriptions (
 id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL,
 patient_id TEXT NOT NULL REFERENCES patients(id), user_id TEXT NOT NULL, session_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','paused','ended')), version INTEGER NOT NULL CHECK(version>0),
 created_at INTEGER NOT NULL,
 FOREIGN KEY(connection_id,organization_id,facility_id) REFERENCES integration_connections(id,organization_id,facility_id),
 UNIQUE(connection_id,patient_id,user_id)
);
CREATE TABLE integration_outbox (
 id TEXT PRIMARY KEY, subscription_id TEXT NOT NULL REFERENCES integration_subscriptions(id),
 source_id TEXT NOT NULL REFERENCES source_observations(id), source_version INTEGER NOT NULL,
 payload TEXT NOT NULL, body_hash TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','sending','retry','delivered','quarantined','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5), due_at INTEGER NOT NULL,
 lease_id TEXT, lease_until INTEGER, diagnostic TEXT NOT NULL, created_at INTEGER NOT NULL, delivered_at INTEGER,
 UNIQUE(subscription_id,source_id,source_version)
);
CREATE INDEX integration_outbox_due ON integration_outbox(status,due_at);
CREATE INDEX integration_inbox_connection ON integration_inbox(connection_id,received_at);
CREATE TABLE integration_controls(name TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(value IN ('available','unavailable')));
INSERT INTO integration_controls VALUES('dependency','available');
CREATE TRIGGER integration_link_immutable BEFORE UPDATE ON integration_links BEGIN SELECT RAISE(ABORT,'partner mapping is immutable'); END;
CREATE TRIGGER integration_receipt_immutable BEFORE UPDATE OF connection_id,message_id,body_hash,payload,external_id,external_version,content_hash ON integration_inbox BEGIN SELECT RAISE(ABORT,'partner receipt is immutable'); END;
CREATE TRIGGER integration_outbox_immutable BEFORE UPDATE OF subscription_id,source_id,source_version,payload,body_hash ON integration_outbox BEGIN SELECT RAISE(ABORT,'outbox snapshot is immutable'); END;
CREATE TRIGGER integration_connection_immutable BEFORE UPDATE OF organization_id,facility_id,endpoint,registration_key,request_hash ON integration_connections BEGIN SELECT RAISE(ABORT,'partner identity is immutable'); END;
CREATE TRIGGER integration_connection_terminal BEFORE UPDATE OF status ON integration_connections WHEN OLD.status='disabled' AND NEW.status<>'disabled' BEGIN SELECT RAISE(ABORT,'disabled connection is terminal'); END;
CREATE TRIGGER integration_subscription_terminal BEFORE UPDATE OF status ON integration_subscriptions WHEN OLD.status='ended' AND NEW.status<>'ended' BEGIN SELECT RAISE(ABORT,'ended subscription is terminal'); END;
`;
// Destructive, disposable fixtures only. Operational rollback retains schema 50.
export const INTEGRATION_FIXTURE_ROLLBACK = `${INTEGRATION_BATCH_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS integration_outbox; DROP TABLE IF EXISTS integration_subscriptions; DROP TABLE IF EXISTS integration_heads; DROP TABLE IF EXISTS integration_aliases; DROP TABLE IF EXISTS integration_inbox; DROP TABLE IF EXISTS integration_links; DROP TABLE IF EXISTS integration_connections; DROP TABLE IF EXISTS integration_controls; DELETE FROM schema_migrations WHERE version=50;`;

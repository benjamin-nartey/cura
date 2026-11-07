import { TIMELINE_PROJECTION_FIXTURE_ROLLBACK } from "./timeline-projection-schema";
export const INTEGRATION_BATCH_SCHEMA = `
CREATE TABLE integration_batches (
 id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES integration_connections(id),
 organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN('import','export')),
 external_key TEXT NOT NULL, manifest_hash TEXT NOT NULL, owner_id TEXT,
 subscription_id TEXT REFERENCES integration_subscriptions(id),
 status TEXT NOT NULL CHECK(status IN('ready','running','paused','completed','cancelled')),
 cursor INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 1000),
 version INTEGER NOT NULL DEFAULT 1, lease_id TEXT, lease_until INTEGER, created_at INTEGER NOT NULL,
 UNIQUE(connection_id,kind,external_key)
);
CREATE TABLE integration_batch_items (
 batch_id TEXT NOT NULL REFERENCES integration_batches(id), seq INTEGER NOT NULL,
 message_id TEXT, payload TEXT, body_hash TEXT, source_id TEXT, source_version INTEGER,
 status TEXT NOT NULL CHECK(status IN('queued','applied','queued-delivery','quarantined','blocked','conflict')),
 diagnostic TEXT NOT NULL, receipt_id TEXT REFERENCES integration_inbox(id), delivery_id TEXT REFERENCES integration_outbox(id),
 version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(batch_id,seq)
);
CREATE TABLE integration_batch_runs (
 batch_id TEXT NOT NULL REFERENCES integration_batches(id), command_key TEXT NOT NULL,
 request_hash TEXT NOT NULL, end_seq INTEGER NOT NULL, status TEXT NOT NULL,
 result_json TEXT, PRIMARY KEY(batch_id,command_key)
);
CREATE TABLE integration_recoveries (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, facility_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 kind TEXT NOT NULL, original_id TEXT NOT NULL, result_id TEXT NOT NULL,
 reason TEXT NOT NULL, previous_status TEXT NOT NULL, previous_attempts INTEGER NOT NULL,
 command_key TEXT NOT NULL, request_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(organization_id,command_key)
);
ALTER TABLE integration_outbox ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_outbox ADD COLUMN recovery_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX integration_batch_owner ON integration_batches(organization_id,facility_id,owner_id,created_at);
CREATE TRIGGER integration_batch_manifest_immutable BEFORE UPDATE OF connection_id,organization_id,facility_id,kind,external_key,manifest_hash,subscription_id,total,created_at ON integration_batches BEGIN SELECT RAISE(ABORT,'batch manifest is immutable'); END;
CREATE TRIGGER integration_batch_item_immutable BEFORE UPDATE OF batch_id,seq,message_id,payload,body_hash,source_id,source_version ON integration_batch_items BEGIN SELECT RAISE(ABORT,'batch item is immutable'); END;
CREATE TRIGGER integration_recovery_immutable BEFORE UPDATE ON integration_recoveries BEGIN SELECT RAISE(ABORT,'recovery history is immutable'); END;
`;
// Disposable tests only; operational rollback retains schema/evidence.
export const INTEGRATION_BATCH_FIXTURE_ROLLBACK = `${TIMELINE_PROJECTION_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS integration_batch_runs; DROP TABLE IF EXISTS integration_batch_items; DROP TABLE IF EXISTS integration_batches; DROP TABLE IF EXISTS integration_recoveries; ALTER TABLE integration_outbox DROP COLUMN recovery_count; ALTER TABLE integration_outbox DROP COLUMN recovery_version; DELETE FROM schema_migrations WHERE version=51;`;

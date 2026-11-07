import { INTEGRATION_FIXTURE_ROLLBACK } from "./integration-schema";
export const SMART_SCHEMA = `
CREATE TABLE smart_clients (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
 redirect_uri TEXT NOT NULL, scopes TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 version INTEGER NOT NULL CHECK(version>0), registration_key TEXT NOT NULL, request_hash TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 UNIQUE(organization_id,registration_key), UNIQUE(id,organization_id)
);
CREATE TABLE smart_requests (
 id TEXT PRIMARY KEY, client_id TEXT NOT NULL, client_version INTEGER NOT NULL, organization_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id), facility_id TEXT NOT NULL REFERENCES facilities(id), session_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), redirect_uri TEXT NOT NULL, audience TEXT NOT NULL,
 scopes TEXT NOT NULL, state TEXT NOT NULL, challenge TEXT NOT NULL, nonce_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','allowed','denied')),
 FOREIGN KEY(client_id,organization_id) REFERENCES smart_clients(id,organization_id), UNIQUE(id,organization_id)
);
CREATE TABLE smart_grants (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, client_version INTEGER NOT NULL,
 organization_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), facility_id TEXT NOT NULL REFERENCES facilities(id),
 session_id TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose='TREATMENT'), patient_id TEXT NOT NULL REFERENCES patients(id),
 scopes TEXT NOT NULL, audience TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER,
 FOREIGN KEY(client_id,organization_id) REFERENCES smart_clients(id,organization_id),
 FOREIGN KEY(request_id,organization_id) REFERENCES smart_requests(id,organization_id)
);
CREATE TABLE smart_codes (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE REFERENCES smart_grants(id), challenge TEXT NOT NULL,
 redirect_uri TEXT NOT NULL, client_id TEXT NOT NULL REFERENCES smart_clients(id), expires_at INTEGER NOT NULL, used_at INTEGER
);
CREATE TABLE smart_tokens (
 hash TEXT PRIMARY KEY, grant_id TEXT NOT NULL UNIQUE REFERENCES smart_grants(id), expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE TABLE smart_controls(name TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(value IN ('available','unavailable')));
INSERT INTO smart_controls VALUES('dependency','available');
CREATE INDEX smart_grants_owner ON smart_grants(organization_id,user_id,created_at);
CREATE INDEX smart_requests_session ON smart_requests(session_id,status,expires_at);
CREATE TRIGGER smart_grant_context_immutable BEFORE UPDATE OF id,request_id,client_id,client_version,organization_id,user_id,facility_id,session_id,purpose,patient_id,scopes,audience,created_at,expires_at ON smart_grants BEGIN SELECT RAISE(ABORT,'SMART grant context is immutable'); END;
CREATE TRIGGER smart_grant_no_unrevoke BEFORE UPDATE OF revoked_at ON smart_grants WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL BEGIN SELECT RAISE(ABORT,'SMART revocation is terminal'); END;
CREATE TRIGGER smart_client_identity_immutable BEFORE UPDATE OF id,organization_id,name,redirect_uri,scopes,registration_key,request_hash,created_by,created_at ON smart_clients BEGIN SELECT RAISE(ABORT,'SMART client identity is immutable'); END;
CREATE TRIGGER smart_client_no_reenable BEFORE UPDATE OF status ON smart_clients WHEN OLD.status='disabled' AND NEW.status<>'disabled' BEGIN SELECT RAISE(ABORT,'SMART client disable is terminal'); END;
`;
// Disposable fixtures only. Operational rollback revokes grants and preserves security evidence.
export const SMART_FIXTURE_ROLLBACK = `${INTEGRATION_FIXTURE_ROLLBACK} DROP TABLE IF EXISTS smart_tokens; DROP TABLE IF EXISTS smart_codes; DROP TABLE IF EXISTS smart_grants; DROP TABLE IF EXISTS smart_requests; DROP TABLE IF EXISTS smart_clients; DROP TABLE IF EXISTS smart_controls; DELETE FROM schema_migrations WHERE version=49;`;

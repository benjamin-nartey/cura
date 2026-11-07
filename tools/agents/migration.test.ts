import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {CHART_AGENT,createDatabase,enqueueAgentRun,FIXTURES,openSession,readSession,seed} from "../../packages/domain/src/index";

test("schema 63 migration retries without losing queued work from schema 62", t => {
  const dir = mkdtempSync(join(tmpdir(),"cura-agent-migration-"));
  t.after(() => rmSync(dir,{recursive:true,force:true}));
  const file = join(dir,"agent.sqlite");
  const db = createDatabase(file);
  seed(db);
  const {sessionId} = openSession(db,FIXTURES.amira);
  const ctx = readSession(db,sessionId)!;
  const runId = enqueueAgentRun(db,ctx,{
    agentId:CHART_AGENT.id,agentVersion:CHART_AGENT.version,patientId:FIXTURES.elena,idempotencyKey:"phase11-migration-run",
  });
  db.exec(`DROP TABLE agent_execution_controls;
    DELETE FROM schema_migrations WHERE version=63;
    CREATE TABLE agent_execution_controls (unexpected TEXT);`);
  db.close();
  assert.throws(() => createDatabase(file),/already exists/);
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()?.version,62);
  assert.equal(raw.prepare("SELECT status FROM agent_runs WHERE id=?").get(runId)?.status,"running");
  raw.exec("DROP TABLE agent_execution_controls");
  raw.close();
  const upgraded = createDatabase(file);
  try {
    assert.equal(upgraded.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()?.version,63);
    assert.equal(upgraded.prepare("SELECT status FROM agent_runs WHERE id=?").get(runId)?.status,"running");
    assert.equal(upgraded.prepare("SELECT COUNT(*) AS count FROM agent_execution_controls").get()?.count,0);
  } finally { upgraded.close(); }
});

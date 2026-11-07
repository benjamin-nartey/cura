import assert from "node:assert/strict";
import {execFile,spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {once} from "node:events";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {promisify} from "node:util";
import {Client,Connection} from "@temporalio/client";
import {callAgentTool,CHART_AGENT,createDatabase,enqueueAgentRun,FIXTURES,ForbiddenError,openSession,readAgentRun,readSession,seed,stopAgentExecution} from "../../packages/domain/src/index";
import {openAgentWorker,startAgentWorkflow} from "./temporal";

test("Temporal retries a lost activity acknowledgement without duplicating a chart review", {timeout:200_000}, async t => {
  const file = join(mkdtempSync(join(tmpdir(),"cura-temporal-")),"agent.sqlite");
  const db = createDatabase(file);
  t.after(() => db.close());
  seed(db);
  const {sessionId} = openSession(db,FIXTURES.amira);
  const ctx = readSession(db,sessionId)!;
  const input = {agentId:CHART_AGENT.id,agentVersion:CHART_AGENT.version,patientId:FIXTURES.elena,idempotencyKey:"temporal-crash-fixture"};
  const queue = `cura-test-${randomUUID()}`;
  const connection = await Connection.connect({address:"127.0.0.1:17233"});
  t.after(() => connection.close());
  const client = new Client({connection});
  const child = spawn(process.execPath,["--import","tsx","tools/agents/crash-fixture.ts"],{
    env:{...process.env,CURA_TEST_DB:file,CURA_TEST_QUEUE:queue,CURA_TEST_SESSION:sessionId},
    stdio:["ignore","inherit","inherit","ipc"],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const childExit = once(child,"exit");
  const ready = await Promise.race([once(child,"message"),childExit]);
  assert.equal(ready[0],"ready");
  const runId = enqueueAgentRun(db,ctx,input);
  assert.equal(enqueueAgentRun(db,ctx,input),runId);
  const handle = await startAgentWorkflow(client,runId,queue);
  const [exitCode] = await childExit;
  assert.equal(exitCode,73);
  assert.equal(readAgentRun(db,ctx,runId)?.status,"awaiting-approval");
  assert.ok(readAgentRun(db,ctx,runId)?.sourceIds.includes(FIXTURES.obsPotassiumHigh));
  for (const toolId of ["tool_issue_medication","tool_schedule_appointment"]) {
    assert.throws(() => callAgentTool(db,ctx,{
      runId,toolId,payload:{patientId:FIXTURES.elena},idempotencyKey:"temporal-denied-tool",
    }),ForbiddenError);
  }
  const {worker,connection:workerConnection} = await openAgentWorker(db,sessionId,queue);
  try {
    await worker.runUntil(async () => {
      assert.equal(await handle.result(),"awaiting-approval");
      assert.equal(await (await startAgentWorkflow(client,runId,queue)).result(),"awaiting-approval");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_steps WHERE run_id=?").get(runId)?.n,2);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_approvals WHERE run_id=?").get(runId)?.n,1);

      const approvalId = readAgentRun(db,ctx,runId)?.approvalId;
      assert.ok(approvalId);
      const reviewer = openSession(db,FIXTURES.jordan);
      const decide = (decision:"approved"|"declined") => promisify(execFile)(process.execPath,
        ["--import","tsx","--input-type=module","-e",`
          import {ConflictError,createDatabase,decideAgentApproval,readSession} from './packages/domain/src/index.ts';
          const db = createDatabase(process.env.CURA_TEST_DB);
          try {
            const ctx = readSession(db,process.env.CURA_TEST_SESSION);
            const decision = process.env.CURA_TEST_DECISION;
            decideAgentApproval(db,ctx,{approvalId:process.env.CURA_TEST_APPROVAL,decision,idempotencyKey:'temporal-race-'+decision});
            console.log('committed');
          } catch (error) {
            if (!(error instanceof ConflictError)) throw error;
            console.log('conflict');
          } finally { db.close(); }
        `],{
          env:{...process.env,CURA_TEST_DB:file,CURA_TEST_SESSION:reviewer.sessionId,
            CURA_TEST_APPROVAL:approvalId,CURA_TEST_DECISION:decision},
          timeout:30_000,
        });
      const decisions = await Promise.all([decide("approved"),decide("declined")]);
      assert.deepEqual(decisions.map(result => result.stdout.trim()).sort(),["committed","conflict"]);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='agent.approval' AND resource_id=? AND outcome='success'").get(approvalId)?.n,2);

      const cancelled = enqueueAgentRun(db,ctx,{...input,idempotencyKey:"temporal-cancel-fixture"});
      stopAgentExecution(db,ctx,cancelled,"cancelled");
      assert.equal(await (await startAgentWorkflow(client,cancelled,queue)).result(),"refused");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_steps WHERE run_id=?").get(cancelled)?.n,0);

      const poison = enqueueAgentRun(db,ctx,{...input,idempotencyKey:"temporal-poison-fixture"});
      db.prepare("UPDATE agent_manifests SET allowed_tools_json='[]' WHERE id=?").run(CHART_AGENT.id);
      await assert.rejects((await startAgentWorkflow(client,poison,queue)).result());
      assert.equal(readAgentRun(db,ctx,poison)?.status,"failed");
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_steps WHERE run_id=?").get(poison)?.n,0);
    });
  } finally {
    await workerConnection.close();
  }
});

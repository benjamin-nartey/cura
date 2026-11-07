import {fileURLToPath,pathToFileURL} from "node:url";
import {createHash} from "node:crypto";
import {ApplicationFailure,Client,Connection,WorkflowExecutionAlreadyStartedError} from "@temporalio/client";
import {NativeConnection,Worker} from "@temporalio/worker";
import {AppError,assertLocalHealthcareSandbox,createDatabase,readSession,resumeAgentRun,stopAgentExecution} from "../../packages/domain/src/index";
import type {chartReviewWorkflow} from "./workflows";

const address = "127.0.0.1:17233";
export async function openAgentWorker(db:ReturnType<typeof createDatabase>, sessionId:string, queue:string) {
  assertLocalHealthcareSandbox();
  const connection = await NativeConnection.connect({address});
  try {
    const worker = await Worker.create({
      connection,taskQueue:queue,
      workflowsPath:fileURLToPath(new URL("./workflows.ts",import.meta.url)),
      activities:{
        async advance(runId:string) {
          const ctx = readSession(db,sessionId);
          if (!ctx) throw ApplicationFailure.nonRetryable("Worker session is unavailable.","AgentPolicy");
          try {
            return resumeAgentRun(db,ctx,runId).status;
          } catch (error) {
            if (error instanceof AppError) throw ApplicationFailure.nonRetryable("Agent execution was denied.","AgentPolicy");
            throw new Error("Agent storage is unavailable.");
          }
        },
        async stop(runId:string,reason:"cancelled"|"workflow-failed") {
          const ctx = readSession(db,sessionId);
          if (!ctx) return;
          try {
            stopAgentExecution(db,ctx,runId,reason);
          } catch (error) {
            if (error instanceof AppError) return;
            throw new Error("Agent storage is unavailable.");
          }
        },
      },
    });
    return {worker,connection};
  } catch (error) {
    await connection.close();
    throw error;
  }
}

export async function startAgentWorkflow(client:Client,runId:string,queue:string) {
  if (!/^run_[a-f0-9-]{36}$/.test(runId)) throw new Error("Invalid agent run ID.");
  try {
    return await client.workflow.start<typeof chartReviewWorkflow>("chartReviewWorkflow",{
      taskQueue:queue,workflowId:runId,args:[runId],
      workflowIdReusePolicy:"REJECT_DUPLICATE",workflowExecutionTimeout:"180 seconds",
    });
  } catch (error) {
    if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    return client.workflow.getHandle<typeof chartReviewWorkflow>(runId);
  }
}

async function main() {
  assertLocalHealthcareSandbox();
  const [command,runId] = process.argv.slice(2);
  if (command === "worker") {
    const filename = process.env.DATABASE_PATH;
    const sessionId = process.env.CURASPHERE_AGENT_SESSION_ID;
    if (!filename || !sessionId) throw new Error("Set the synthetic database path and worker session.");
    const db = createDatabase(filename);
    try {
      const ctx = readSession(db,sessionId);
      if (!ctx?.facilityId) throw new Error("The worker session has no facility.");
      const scope = createHash("sha256").update(JSON.stringify([filename,ctx.organizationId,ctx.facilityId,ctx.userId])).digest("hex");
      const queue = `curasphere-chart-v1-${scope}`;
      const {worker,connection} = await openAgentWorker(db,sessionId,queue);
      try {
        const clientConnection = await Connection.connect({address});
        const client = new Client({connection:clientConnection});
        let dispatching:Promise<void> | undefined;
        const pending = db.prepare("SELECT id FROM agent_runs WHERE organization_id=? AND facility_id=? AND actor_id=? AND status='running' ORDER BY created_at LIMIT 50");
        const timer = setInterval(() => {
          if (dispatching) return;
          const active = readSession(db,sessionId);
          if (!active || active.userId !== ctx.userId || active.organizationId !== ctx.organizationId || active.facilityId !== ctx.facilityId) return;
          dispatching = (async () => {
            for (const row of pending.all(ctx.organizationId,ctx.facilityId,ctx.userId)) {
              const runId = String(row.id);
              const handle = await startAgentWorkflow(client,runId,queue);
              const {status} = await handle.describe();
              if (status.name === "CANCELLED") stopAgentExecution(db,active,runId,"cancelled");
              if (["FAILED","TIMED_OUT","TERMINATED"].includes(status.name)) stopAgentExecution(db,active,runId,"workflow-failed");
            }
          })().catch(() => console.error("Agent workflow dispatch will retry.")).finally(() => {dispatching=undefined;});
        },1000);
        try {
          await worker.run();
        } finally {
          clearInterval(timer);
          await dispatching;
          await clientConnection.close();
        }
      } finally { await connection.close(); }
    } finally { db.close(); }
    return;
  }
  if (!runId || !/^run_[a-f0-9-]{36}$/.test(runId) || command !== "cancel") {
    throw new Error("Use worker or cancel RUN_ID.");
  }
  const connection = await Connection.connect({address});
  try {
    const client = new Client({connection});
    await client.workflow.getHandle(runId).cancel();
  } finally { await connection.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Local agent workflow command failed."); process.exitCode=1; });
}

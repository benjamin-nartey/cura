import {resolve} from "node:path";
import {NativeConnection,Worker} from "@temporalio/worker";
import {createDatabase,readSession,resumeAgentRun} from "../../packages/domain/src/index";

async function run() {
  const filename = process.env.CURA_TEST_DB;
  const sessionId = process.env.CURA_TEST_SESSION;
  const taskQueue = process.env.CURA_TEST_QUEUE;
  if (!filename || !sessionId || !taskQueue?.startsWith("cura-test-")) throw new Error("Missing crash fixture configuration.");
  const db = createDatabase(filename);
  const ctx = readSession(db,sessionId);
  if (!ctx) throw new Error("Missing crash fixture session.");
  const connection = await NativeConnection.connect({address:"127.0.0.1:17233"});
  const worker = await Worker.create({
    connection,taskQueue,workflowsPath:resolve("tools/agents/workflows.ts"),
    activities:{
      async advance(runId:string) {
        if (resumeAgentRun(db,ctx,runId).status !== "awaiting-approval") process.exit(2);
        process.exit(73);
      },
    },
  });
  const running = worker.run();
  process.send?.("ready");
  await running;
}

run().catch(error => { console.error(error); process.exitCode=1; });

import { runEngineering } from "./runner.mjs";
import { loadContext } from "./verify.mjs";

// Separate CLI avoids an asynchronous module cycle between runner and verifier.
const result = await runEngineering(loadContext(), {
  verifyOnly: true,
  requestedFeature: process.argv.find((item) => item.startsWith("--feature="))?.slice(10),
});
process.exitCode = result.status === "AUTHORIZED_SCOPE_COMPLETE" ? 0 : 1;

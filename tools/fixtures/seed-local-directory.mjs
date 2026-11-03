import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowed =
  process.env.CURASPHERE_ENV === "local" &&
  process.env.CURASPHERE_DATA_CLASS === "synthetic" &&
  process.env.CURASPHERE_DEV_DIRECTORY === "local-test" &&
  process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE === "true";
if (!allowed) {
  console.error("fixture_refused");
  process.exit(1);
}
const host = process.env.PGHOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error("fixture_refused");
  process.exit(1);
}
const sql = path.join(path.dirname(fileURLToPath(import.meta.url)), "seed-local-directory.sql");
const result = spawnSync(
  "psql",
  ["-h", host, "-p", process.env.PGPORT ?? "5432", "-U", process.env.PGUSER ?? "curasphere", "-d", process.env.PGDATABASE ?? "curasphere", "-v", "ON_ERROR_STOP=1", "-f", sql],
  { stdio: "inherit", env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD ?? "" } },
);
process.exit(result.status ?? 1);

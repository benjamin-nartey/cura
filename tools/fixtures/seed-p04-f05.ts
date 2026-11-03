import { createDatabase } from "../../packages/domain/src/db.ts";
import { seed } from "../../packages/domain/src/seed.ts";
import { seedDemoTenants } from "../../packages/domain/src/tenancy.ts";
import { sandboxFindings } from "../governance/sandbox.mjs";
import { inside } from "../governance/v2/core.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (!sandboxFindings(process.env).allowed) throw new Error("Synthetic local sandbox required.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const target = path.resolve(process.env.DATABASE_PATH ?? "data/p04f05-e2e.sqlite");
const relative = path.relative(root, target).replaceAll("\\", "/");
if (relative !== "data/p04f05-e2e.sqlite" && !/^artifacts\/governance-v2\/.+\.sqlite$/.test(relative)) throw new Error("Only the dedicated synthetic fixture database is allowed.");
const database = createDatabase(inside(root, relative));
seed(database);
seedDemoTenants(database);
database.close();
console.log("P04-F05 synthetic chart fixtures ready in the isolated E2E database.");

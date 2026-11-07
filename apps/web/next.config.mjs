import path from "node:path";
import { fileURLToPath } from "node:url";
import { refuseUnsafeOverride } from "../../tools/governance/sandbox.mjs";

refuseUnsafeOverride(process.env);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.DATABASE_PATH ??= path.join(root, "data", "curasphere.sqlite");
if (process.env.CURASPHERE_ENV !== "production" && process.env.CURASPHERE_ENV !== "staging") {
  process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.CURASPHERE_NEXT_DIST ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@curasphere/domain", "@curasphere/contracts", "@curasphere/fhir"],
  logging: {
    incomingRequests: {
      ignore: [/\/api\/auth\/callback/],
    },
  },
};

export default nextConfig;

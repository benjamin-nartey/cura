import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.DATABASE_PATH ??= path.join(root, "data", "curasphere.sqlite");
if (process.env.CURASPHERE_ENV !== "production" && process.env.CURASPHERE_ENV !== "staging") {
  process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@curasphere/domain", "@curasphere/contracts"],
  logging: {
    incomingRequests: {
      ignore: [/\/api\/auth\/callback/],
    },
  },
};

export default nextConfig;

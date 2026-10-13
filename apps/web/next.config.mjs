import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
process.env.DATABASE_PATH ??= path.join(root, "data", "curasphere.sqlite");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@curasphere/domain", "@curasphere/contracts"],
};

export default nextConfig;

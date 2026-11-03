import path from "node:path";
import { existsSync } from "node:fs";

export function commandCatalog() {
  const node = (...args) => ({ argv: [process.execPath, ...args], cwd: ".", timeoutMs: 600_000 });
  const npmCli = process.env.npm_execpath ?? path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  if (!existsSync(npmCli)) throw new Error("npm CLI entrypoint unavailable; invoke through npm run governance:verify.");
  const npm = (...args) => node(npmCli, ...args);
  return {
    "v2-tests": node("--test", "tools/governance/v2/core.test.mjs", "tools/governance/v2/runner.test.mjs"),
    "legacy-governance": npm("run", "governance:test"),
    constitution: npm("run", "constitution:phase00"),
    lint: npm("run", "lint"),
    typecheck: npm("run", "typecheck"),
    domain: npm("test"),
    billing: { ...node("--import", "tsx", "--import", "./test/dev-env.ts", "--test", "test/billing.test.ts"), cwd: "packages/domain" },
    contracts: node("--test", "tools/platform/contract-compat.test.mjs", "tools/platform/signing.test.mjs", "tools/platform/delivery-static.test.mjs"),
    build: npm("run", "build"),
    audit: npm("audit", "--json"),
    e2e: { ...npm("run", "test:e2e:p04f05"), timeoutMs: 600_000, managedWeb: true },
  };
}

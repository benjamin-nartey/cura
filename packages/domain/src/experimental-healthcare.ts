import { ForbiddenError } from "./errors";

export function assertLocalHealthcareSandbox() {
  const env = process.env;
  const databaseUrl = env.DATABASE_URL ?? "";
  if (env.CURASPHERE_ENV !== "local" || env.CURASPHERE_DEV_DIRECTORY !== "local-test"
    || env.CURASPHERE_DATA_CLASS !== "synthetic" || env.CURASPHERE_LOCAL_PHASE_OVERRIDE !== "true"
    || env.CURASPHERE_PRODUCTION_DATABASE || env.CURASPHERE_PRODUCTION_CREDENTIALS === "true"
    || env.CURASPHERE_REAL_PHI === "true" || env.CURASPHERE_EXTERNAL_HEALTHCARE === "true"
    || env.CURASPHERE_ALLOW_PUBLISH === "true" || env.CURASPHERE_CLINICAL_EMERGENCY === "enabled"
    || ["production", "staging"].includes(env.CURASPHERE_DEPLOY_TARGET ?? "")
    || (databaseUrl && (!/localhost|127\.0\.0\.1/.test(databaseUrl) || /production|\bprod\b/i.test(databaseUrl)))) {
    throw new ForbiddenError("forbidden", "This experimental workspace requires the isolated local synthetic sandbox.");
  }
}

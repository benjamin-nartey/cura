const PRODUCTION_ENVS = new Set(["production", "staging"]);

export function productionDatabaseConfigured(env) {
  if (env.CURASPHERE_PRODUCTION_DATABASE) return true;
  const url = env.DATABASE_URL || "";
  if (!url) return false;
  if (/production|\bprod\b/i.test(url)) return true;
  return !/localhost|127\.0\.0\.1/.test(url);
}

export function sandboxFindings(env) {
  const findings = [];
  if (env.CURASPHERE_LOCAL_PHASE_OVERRIDE !== "true") findings.push("The local experimental override is not enabled.");
  if (env.CURASPHERE_DEV_DIRECTORY !== "local-test") findings.push("CURASPHERE_DEV_DIRECTORY is not local-test.");
  if (env.CURASPHERE_ENV !== "local") findings.push("CURASPHERE_ENV is not local.");
  if (env.NODE_ENV === "development" && env.CURASPHERE_DEV_DIRECTORY !== "local-test") {
    findings.push("NODE_ENV=development does not establish a local-test sandbox.");
  }
  if (PRODUCTION_ENVS.has(env.CURASPHERE_ENV)) findings.push("The override is refused in production and staging.");
  if (env.CURASPHERE_DATA_CLASS !== "synthetic") findings.push("The data classification is not synthetic.");
  if (productionDatabaseConfigured(env)) findings.push("A production database connection is configured.");
  if (env.CURASPHERE_PRODUCTION_CREDENTIALS === "true") findings.push("Production credentials are configured.");
  if (env.CURASPHERE_REAL_PHI === "true" || env.CURASPHERE_DATA_CLASS === "real") findings.push("Real patient data is marked present.");
  if (env.CURASPHERE_ALLOW_PUBLISH === "true" || env.CURASPHERE_DEPLOY_TARGET === "production" || env.CURASPHERE_DEPLOY_TARGET === "staging") {
    findings.push("Publishing or a protected deployment target is enabled.");
  }
  if (env.CURASPHERE_EXTERNAL_HEALTHCARE === "true") findings.push("An external healthcare connection is enabled.");
  if (env.CURASPHERE_CLINICAL_EMERGENCY === "enabled") findings.push("Clinical emergency access is enabled.");
  return {
    overrideRequested: env.CURASPHERE_LOCAL_PHASE_OVERRIDE === "true",
    allowed: findings.length === 0,
    findings,
  };
}

export function refuseUnsafeOverride(env) {
  if (env.CURASPHERE_LOCAL_PHASE_OVERRIDE !== "true") return;
  const result = sandboxFindings(env);
  if (!result.allowed) {
    const error = new Error("Local experimental override refused.");
    error.code = "experimental-override-refused";
    throw error;
  }
}

if (process.argv[1] && process.argv[1].endsWith("sandbox.mjs") && process.argv.includes("--deployment")) {
  if (process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE === "true") {
    console.error("Experimental artifacts cannot be published or deployed.");
    process.exit(1);
  }
}

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const lock = JSON.parse(await readFile(new URL("./validator.lock.json", import.meta.url), "utf8"));

/** Refuse partial downloads and substituted validators before executing Java. */
export async function verifyValidator(path) {
  const bytes = await readFile(path);
  if (bytes.length !== lock.bytes || createHash("sha256").update(bytes).digest("hex") !== lock.sha256) {
    throw new Error(`Validator integrity failure: expected HL7 validator ${lock.version} (${lock.sha256}).`);
  }
}

export function outcomeIssues(outcome) {
  if (outcome?.resourceType !== "OperationOutcome" || !Array.isArray(outcome.issue) || outcome.issue.length === 0) {
    throw new Error("The validator did not produce a nonempty OperationOutcome.");
  }
  const allowed = new Set(["fatal", "error", "warning", "information"]);
  if (outcome.issue.some((issue) => !issue || !allowed.has(issue.severity) || typeof issue.code !== "string")) {
    throw new Error("The validator produced an invalid issue.");
  }
  return outcome.issue;
}

async function run(java, args, logPath) {
  const output = createWriteStream(logPath);
  const code = await new Promise((accept, reject) => {
    const child = spawn(java, args, { cwd: root, shell: false, windowsHide: true });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Validator exceeded 15 minutes; inspect ${logPath}.`));
    }, 15 * 60 * 1000);
    timeout.unref();
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    output.on("error", (error) => { child.kill(); reject(error); });
    child.on("error", (error) => { clearTimeout(timeout); output.end(); reject(error); });
    child.on("close", (code) => { clearTimeout(timeout); accept(code); });
  }).catch((error)=>{output.end();throw error;});
  await new Promise((accept, reject) => { output.on("error", reject); output.end(accept); });
  return code;
}

export async function main() {
  const destination = resolve(root, "artifacts/governance-v2/P06-F01-validator");
  await mkdir(destination, { recursive: true });
  const startedAt = new Date().toISOString();
  // Invalidate prior aggregate evidence even if integrity or startup fails.
  await writeFile(resolve(destination,"summary.json"),JSON.stringify({status:"in-progress",startedAt,validator:lock,results:[]},null,2)+"\n");
  const jar = resolve(root, process.env.CURASPHERE_FHIR_VALIDATOR_JAR ?? `artifacts/governance-v2/fhir-validator/validator-${lock.version}.jar`);
  await verifyValidator(jar);
  const java = process.env.CURASPHERE_FHIR_JAVA ?? "java";
  const manifest = JSON.parse(await readFile(new URL("../../packages/fhir/validation/manifest.json", import.meta.url), "utf8"));
  const results = [];
  for (const fixture of manifest.fixtures) {
    const outcomePath = resolve(destination, `${fixture.name}.json`);
    // An old passing report must never stand in for an invocation that failed.
    await writeFile(outcomePath, "null\n");
    const code = await run(java, ["-jar", jar,
      resolve(root, "packages/fhir/validation", fixture.file),
      "-version", lock.fhirVersion, "-tx", "n/a",
      "-ig", resolve(root, "packages/fhir/profiles"),
      "-profile", fixture.profile,
      "-output", outcomePath], resolve(destination, `${fixture.name}.log`));
    const issues = outcomeIssues(JSON.parse(await readFile(outcomePath, "utf8")));
    const errors = issues.filter((issue) => issue.severity === "error" || issue.severity === "fatal");
    const passed = fixture.valid ? code === 0 && errors.length === 0 : code !== 0 && errors.length > 0 &&
      typeof fixture.expectedError === "string" && errors.some((issue) => JSON.stringify(issue).includes(fixture.expectedError));
    results.push({ name: fixture.name, expectedValid: fixture.valid, exitCode: code, passed,
      errors: errors.length, warnings: issues.filter((issue) => issue.severity === "warning").length });
    process.stdout.write(`${fixture.name}: ${passed ? "PASS" : "FAIL"} (${errors.length} errors)\n`);
  }
  await writeFile(resolve(destination, "summary.json"), JSON.stringify({
    status:"complete",startedAt,finishedAt:new Date().toISOString(),
    validator: lock, terminologyServer: "disabled (-tx n/a)",
    scope: "Synthetic local fixture/profile validation; not clinical approval or licensed terminology validation",
    results,
  }, null, 2) + "\n");
  if (!results.length || results.some((result) => !result.passed)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

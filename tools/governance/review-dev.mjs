import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activationDecision,
  assessAuthorization,
  evaluateCommand,
  evaluateStatic,
  overallResult,
  pendingApprovals,
  readJson,
  sha256File,
  validateMatrix,
} from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const staticOnly = process.argv.includes("--static-only");
const isolated = Boolean(process.env.GOV_EVIDENCE_DIR);

const matrix = readJson(root, "docs/governance/standards-control-matrix.json");
const matrixErrors = validateMatrix(matrix);
if (matrixErrors.length) {
  console.error(matrixErrors.join("\n"));
  process.exit(1);
}

const approvals = readJson(root, "docs/identity/PHASE_02_APPROVALS.json");
const approvalErrors = pendingApprovals(approvals);
if (approvalErrors.length) {
  console.error(approvalErrors.join("\n"));
  process.exit(1);
}

const revision = git(["rev-parse", "HEAD"]);
const dirty = git(["status", "--porcelain"]);
const evaluatedAt = new Date().toISOString();
const commands = staticOnly ? {} : runCommands();

const findings = matrix.controls.map((control) => {
  if (control.check === "command") return evaluateCommand(control, commands);
  return evaluateStatic(root, control);
});

const amendmentSha = sha256File(root, "docs/constitution/amendments/DEV-GOV-2026-001.md");
const authorizationPath = path.join(root, "docs/governance/development-exception-authorization.json");
const authorization = existsSync(authorizationPath) ? JSON.parse(readFileSync(authorizationPath, "utf8")) : null;
const authorizationResult = assessAuthorization(authorization, amendmentSha);
const register = readJson(root, "docs/governance/development-exception-register.json");
const activation = activationDecision(register, authorizationResult, findings);
const automated = overallResult(findings);

const run = {
  policy: "CURASPHERE-DEV-GOVERNANCE-v1",
  exception: "DEV-GOV-2026-001",
  evaluatedAt,
  revision: revision.stdout.trim(),
  dirty: dirty.stdout.trim().length > 0,
  automatedAssessment: automated,
  engineeringAcceptance: "ENGINEERING_ACCEPTED",
  developmentException: activation.developmentException,
  governanceApproval: "PENDING",
  productionAuthorization: "NOT_AUTHORIZED",
  phase02: "IN_PROGRESS",
  phase03Development: activation.phase03Development,
  amendmentSha256: amendmentSha,
  humanReviewsChanged: false,
  activationBlocked: activation.blocked,
  commands: Object.fromEntries(Object.entries(commands).map(([key, value]) => [key, { exitCode: value.exitCode, result: value.result ?? null, summary: value.summary }])),
  findings,
};

const outDir = isolated ? path.resolve(process.env.GOV_EVIDENCE_DIR) : path.join(root, "docs/governance/automated");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "review-run.json"), `${JSON.stringify(run, null, 2)}\n`);
writeReport(outDir, "P02-R01-architecture-assessment.md", "P02-R01", "Automated architecture evidence", findings, run);
writeReport(outDir, "P02-R02-security-assessment.md", "P02-R02", "Automated security evidence", findings, run);
writeReport(outDir, "P02-R03-clinical-safety-evidence.md", "P02-R03", "Automated clinical safety evidence", findings, run);
writeReport(outDir, "P02-R04-role-matrix-evidence.md", "P02-R04", "Role matrix evidence", findings, run);
writeReport(outDir, "P02-R05-emergency-intended-use-evidence.md", "P02-R05", "Emergency intended-use evidence", findings, run);

if (!isolated) register.statuses.automatedAssessment = automated;
register.statuses.developmentException = "PROPOSED";
register.statuses.governanceApproval = "PENDING";
register.statuses.productionAuthorization = "NOT_AUTHORIZED";
register.status = "PROPOSED";
register.developmentModeActive = false;
register.phase03Development = "NOT_AUTHORIZED";
register.lastAutomatedRun = evaluatedAt;
register.amendmentSha256 = amendmentSha;
if (!isolated) {
  writeFileSync(path.join(root, "docs/governance/development-exception-register.json"), `${JSON.stringify(register, null, 2)}\n`);
  writeHumanRegister(run);
}

console.log(`automated=${automated}`);
console.log(`exception=${activation.developmentException}`);
console.log(`phase03=${activation.phase03Development}`);
for (const reason of activation.blocked) console.log(`blocked: ${reason}`);
process.exit(automated === "AUTOMATED_HARD_STOP" ? 2 : 0);

function runCommands() {
  return {
    domain: spawnNpm(["test", "--workspace", "@curasphere/domain"], 240000),
    constitution: spawnNpm(["run", "constitution:phase00"], 60000),
    "audit-domain": spawnNpm(["audit", "--omit=dev", "--workspace", "@curasphere/domain"], 60000),
    "audit-web": spawnNpm(["audit", "--omit=dev", "--workspace", "@curasphere/web"], 60000),
    gateway: gatewayVersions(),
    "pip-audit": pipAudit(),
    trivy: imageScan(),
    actions: hostedActions(),
    "foundation-health": foundationHealth(),
  };
}

function spawnNpm(args, timeout) {
  const result = spawnSync("npm", args, { cwd: root, encoding: "utf8", timeout, shell: true });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return { exitCode: result.status ?? 1, summary: result.error ? result.error.message : tail(text) };
}

function gatewayVersions() {
  const python = path.join(root, "ai/gateway/.venv/Scripts/python.exe");
  if (!existsSync(python)) return { exitCode: null, result: "NOT_VERIFIED", summary: "Gateway virtualenv python was not found." };
  const code = "import fastapi, starlette, sys; print(fastapi.__version__); print(starlette.__version__); print(sys.version.split()[0])";
  const result = spawnSync(python, ["-c", code], { encoding: "utf8", timeout: 30000 });
  const lines = (result.stdout ?? "").trim().split(/\r?\n/);
  const patched = atLeast(lines[0], "0.143.0") && atLeast(lines[1], "1.8.0");
  return {
    exitCode: result.status ?? 1,
    result: result.status === 0 && patched ? "PASS" : "FAIL",
    summary: `FastAPI ${lines[0] ?? "unknown"}, Starlette ${lines[1] ?? "unknown"}, Python ${lines[2] ?? "unknown"}.`,
  };
}

function pipAudit() {
  const python = path.join(root, "ai/gateway/.venv/Scripts/python.exe");
  if (!existsSync(python)) return { exitCode: null, result: "NOT_VERIFIED", summary: "Gateway virtualenv python was not found." };
  const result = spawnSync(python, ["-m", "pip_audit", "--requirement", "ai/gateway/requirements.lock", "--no-deps", "--progress-spinner", "off"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    exitCode: result.status ?? 1,
    result: result.status === 0 && /No known vulnerabilities found/.test(text) ? "PASS" : "FAIL",
    summary: tail(text),
  };
}

function imageScan() {
  const local = spawnSync("trivy", ["--version"], { encoding: "utf8" });
  if (!local.error && local.status === 0) return scanWith(["trivy"], local.stdout);
  return scanWith(["docker", "run", "--rm", "-v", "/var/run/docker.sock:/var/run/docker.sock", "-v", "curasphere-trivy-cache:/root/.cache/trivy", "aquasec/trivy:0.76.0"], "");
}

function scanWith(prefix, versionText) {
  const scan = spawnSync(prefix[0], [...prefix.slice(1), "image", "--severity", "HIGH,CRITICAL", "--exit-code", "1", "--quiet", "curasphere-ai-gateway:good"], {
    encoding: "utf8",
    timeout: 300000,
  });
  const text = `${versionText}\n${scan.stdout ?? ""}\n${scan.stderr ?? ""}`;
  if (scan.error || /unable to find the specified image|image not found|Cannot connect/i.test(text)) {
    return { exitCode: scan.status, result: "NOT_VERIFIED", summary: tail(text) || "The image scan did not complete." };
  }
  if (scan.status !== 0) return { exitCode: scan.status, result: "FAIL", summary: tail(text) || "The image scan reported high or critical findings, or it failed." };
  return { exitCode: 0, result: "PASS", summary: tail(text) || "Trivy exited 0 for HIGH,CRITICAL on curasphere-ai-gateway:good." };
}

function atLeast(version, floor) {
  const parse = (value) => String(value ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(version);
  const right = parse(floor);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

function hostedActions() {
  const result = spawnSync(process.execPath, ["-e", "fetch('https://api.github.com/repos/benjamin-nartey/cura/actions/runs?per_page=1').then(async (response)=>{const body=await response.json(); const run=(body.workflow_runs||[])[0]; if(!run){console.log('http', response.status, 'runs', 0); process.exit(2)}; console.log(['http', response.status, 'conclusion', run.conclusion, 'sha', run.head_sha, 'url', run.html_url].join(' '))}).catch((error)=>{console.error(error.message); process.exit(1)})"], {
    encoding: "utf8",
    timeout: 20000,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return {
    exitCode: result.status,
    result: "NOT_VERIFIED",
    summary: `${text || "The public Actions query did not complete."} gh is not installed. This is not branch-protection evidence and it does not cover the unpushed working tree.`,
  };
}

function foundationHealth() {
  const result = spawnSync(process.execPath, ["-e", "fetch('http://127.0.0.1:8081/health').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.message); process.exit(1)})"], {
    encoding: "utf8",
    timeout: 8000,
  });
  if (result.status !== 0) return { exitCode: result.status, result: "NOT_VERIFIED", summary: "Foundation health was not reachable on 127.0.0.1:8081." };
  const schema15 = (result.stdout ?? "").includes("15");
  return {
    exitCode: 0,
    result: schema15 ? "PASS" : "FAIL",
    summary: schema15 ? "Foundation health responded and included schema version 15." : tail(result.stdout ?? ""),
  };
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function tail(text) {
  return text.trim().split(/\r?\n/).slice(-8).join(" ");
}

function writeReport(dir, file, review, title, rows, evidence) {
  const mine = rows.filter((item) => item.review === review);
  const lines = [
    `# ${title}`,
    "",
    "This is automated technical evidence. It is not a human architecture, security, or clinical approval. It does not change P02-R01 through P02-R06, and it is not a certification.",
    "",
    `- Review: ${review}`,
    `- Evaluated at: ${evidence.evaluatedAt}`,
    `- Revision: ${evidence.revision}`,
    `- Working tree dirty: ${evidence.dirty}`,
    `- Automated result: ${evidence.automatedAssessment}`,
    `- Development exception: ${evidence.developmentException}`,
    `- Phase 03: ${evidence.phase03Development}`,
    "",
    "| Control | Framework | Result | Evidence |",
    "| --- | --- | --- | --- |",
    ...mine.map((item) => `| ${item.id} | ${item.framework} | ${item.result} | ${item.summary.replaceAll("|", "/")} |`),
    "",
    "## Outstanding",
    "",
    ...mine.filter((item) => item.outstanding).map((item) => `- ${item.id}: ${item.outstanding}`),
    "",
  ];
  writeFileSync(path.join(dir, file), lines.join("\n"));
}

function writeHumanRegister(evidence) {
  const document = {
    policy: "CURASPHERE-DEV-GOVERNANCE-v1",
    evaluatedAt: evidence.evaluatedAt,
    note: "Automated results are not human decisions. Reviewer names stay empty until a person decides.",
    reviews: approvals.reviews.map((review) => ({
      review_id: review.review_id,
      decision: review.decision,
      reviewer_name: review.reviewer_name,
      decided_at: review.decided_at,
    })),
    exception: {
      id: "DEV-GOV-2026-001",
      status: "PROPOSED",
      amendmentSha256: evidence.amendmentSha256,
      required: evidence.activationBlocked,
    },
  };
  writeFileSync(path.join(root, "docs/governance/human-approval-register.json"), `${JSON.stringify(document, null, 2)}\n`);
}

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hash, inside } from "./core.mjs";

export function redact(text) {
  return text.replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, "$1[REDACTED]")
    .replace(/((?:password|api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

export async function execute(root, spec, log, env = process.env, input) {
  const target = inside(root, log);
  mkdirSync(path.dirname(target), { recursive: true });
  const logFd = openSync(target, "wx");
  const startedAt = new Date().toISOString();
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    let launchError = null;
    const cwd = spec.cwd === "." ? root : inside(root, spec.cwd);
    const childEnv = { ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd, env: childEnv, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, spec.timeoutMs ?? 600_000);
    const collect = (chunk) => {
      output += chunk.toString();
      if (output.length > 32 * 1024 * 1024) { timedOut = true; child.kill(); }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => { launchError = error.code ?? error.message; });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (launchError) output += `\nlaunch_error=${launchError}\n`;
      const safe = redact(output);
      // Never replace evidence from an earlier attempt.
      writeFileSync(logFd, safe);
      closeSync(logFd);
      resolve({ argv: spec.argv, cwd: spec.cwd, startedAt, finishedAt: new Date().toISOString(), exitCode, signal, timedOut, launchError, log, logSha256: hash(safe), output: safe });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function withWeb(root, env, run, operation, port = 3106) {
  const baseURL = `http://127.0.0.1:${port}`;
  let output = "";
  let ended = false;
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "apps/web", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  server.on("error", (error) => { output += `server_error=${error.code}\n`; ended = true; });
  server.on("close", () => { ended = true; });
  try {
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline && !ended) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (ended) break;
      if (!/Ready in|ready - started server/i.test(output)) continue;
      try {
        const response = await fetch(baseURL, { signal: AbortSignal.timeout(4000) });
        if (response.ok && !ended) { ready = true; break; }
      } catch { /* bounded startup probe; not acceptance evidence */ }
    }
    if (!ready) throw new Error("Managed synthetic web server did not become ready.");
    return await operation(baseURL);
  } finally {
    if (!ended) await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      server.once("close", () => { clearTimeout(timer); resolve(); });
      server.kill();
    });
    writeFileSync(inside(root, `${run}/web-server.log`), redact(output), { flag: "wx" });
  }
}

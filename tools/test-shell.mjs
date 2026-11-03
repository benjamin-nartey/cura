import path from "node:path";

// Windows' bash alias may launch an unconfigured WSL distribution.
export const testBash = process.env.CURASPHERE_TEST_BASH ?? (process.platform === "win32"
  ? path.join(process.env.ProgramFiles ?? "C:/Program Files", "Git", "bin", "bash.exe")
  : "bash");

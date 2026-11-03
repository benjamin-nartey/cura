import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: "mobile-workspace.spec.ts", reporter: [["list"], ["json", { outputFile: "artifacts/governance-v2/mobile-workspace/results.json" }]], use: { ...base.use, baseURL: process.env.CURASPHERE_E2E_BASE_URL ?? "http://127.0.0.1:3000" } });

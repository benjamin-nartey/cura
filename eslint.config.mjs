import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/.next*/**", "artifacts/**", "test-results/**"] },
  {
    files: ["tools/governance/v2/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
    rules: { ...js.configs.recommended.rules, "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error", eqeqeq: "error" },
  },
  {
    files: ["packages/domain/src/billing.ts", "packages/domain/src/patient-chart.ts", "packages/domain/src/experimental-healthcare.ts", "apps/web/app/billing/**/*.tsx", "apps/web/app/patients/**/chart/*.tsx", "apps/web/app/api/billing/**/*.ts", "apps/web/lib/billing.ts", "tools/e2e/p04-f05.spec.ts", "playwright.config.ts"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-dupe-args": "error", "no-dupe-else-if": "error", "no-duplicate-case": "error", "no-unreachable": "error",
      "no-unsafe-finally": "error", "no-constant-binary-expression": "error", "use-isnan": "error", "valid-typeof": "error",
      "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error", eqeqeq: "error",
    },
  },
];

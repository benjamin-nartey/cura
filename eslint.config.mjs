import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/.next*/**", "artifacts/**", "test-results/**"] },
  {
    files: ["tools/governance/v2/**/*.mjs", "tools/fhir/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
    rules: { ...js.configs.recommended.rules, "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error", eqeqeq: "error" },
  },
  {
    files: ["packages/contracts/src/index.ts", "tools/platform/smart-http.test.ts", "packages/domain/src/smart*.ts", "packages/domain/test/smart*.ts", "apps/web/lib/smart.ts", "apps/web/components/smart-app.tsx", "apps/web/app/interop/apps/**/*.tsx", "apps/web/app/api/smart/**/*.ts", "apps/web/app/.well-known/**/*.ts", "tools/e2e/p06-f02.spec.ts", "packages/domain/src/fhir-source*.ts", "packages/domain/test/fhir-source*.ts", "apps/web/app/interop/source/**/*.tsx", "apps/web/app/api/integrations/r4/**/*.ts", "apps/web/components/fhir-source-preview.tsx", "apps/web/lib/fhir-source.ts", "tools/fhir/**/*.ts", "tools/platform/fhir-source-http.test.ts", "tools/e2e/p06-f01.spec.ts"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.node, ...globals.browser } },
    rules: { "no-unreachable": "error", "no-constant-binary-expression": "error", "no-eval": "error", "no-new-func": "error", eqeqeq: "error" },
  },
  {
    files: ["packages/domain/src/billing.ts", "packages/domain/src/dashboard.ts", "packages/domain/src/code-system-registry.ts", "packages/domain/src/unit-conversion.ts", "packages/domain/src/terminology-validation.ts", "packages/domain/src/terminology-mappings.ts", "packages/domain/src/facility-catalogs.ts", "packages/domain/src/clinical-coding.ts", "packages/domain/src/clinical-coding-schema.ts", "packages/domain/src/clinical-code-pickers.ts", "packages/domain/test/clinical-coding.test.ts", "packages/domain/src/clinical-source.ts", "apps/web/components/clinical-code-picker.tsx", "apps/web/app/clinical/**/*.tsx", "apps/web/app/api/clinical/**/*.ts", "apps/web/lib/clinical-coding.ts", "apps/web/lib/clinical.ts", "apps/web/app/work/orders/error.tsx", "tools/e2e/p05-f05.spec.ts", "tools/e2e/booking.ts", "packages/domain/src/facility-catalog-schema.ts", "packages/domain/test/facility-catalogs.test.ts", "packages/domain/src/work.ts", "apps/web/components/catalog-form.tsx", "tools/e2e/p05-f04.spec.ts", "apps/web/app/work/orders/**/*.tsx", "apps/web/app/api/work/orders/route.ts", "packages/domain/src/terminology-mapping-schema.ts", "packages/domain/test/terminology-mappings.test.ts", "apps/web/components/mapping-tools.tsx", "tools/e2e/p05-f03.spec.ts", "packages/domain/test/terminology-validation.test.ts", "apps/web/components/terminology-tools.tsx", "tools/e2e/p05-f02.spec.ts", "packages/domain/src/code-system-schema.ts", "packages/domain/test/code-system-registry.test.ts", "apps/web/app/terminology/**/*.tsx", "apps/web/app/api/terminology/**/*.ts", "apps/web/lib/terminology-registry.ts", "apps/web/components/release-form.tsx", "tools/e2e/p05-f01.spec.ts", "apps/mobile/App.tsx", "apps/mobile/src/**/*.tsx", "apps/mobile/src/**/*.ts", "apps/web/app/api/mobile-workspace/**/*.ts", "apps/web/lib/mobile-origin.ts", "apps/web/proxy.ts", "tools/e2e/mobile-workspace.spec.ts", "playwright.mobile.config.ts", "tools/platform/mobile-origin.test.ts", "packages/domain/test/dashboard-data.test.ts", "packages/domain/src/patient-chart.ts", "packages/domain/src/experimental-healthcare.ts", "apps/web/app/billing/**/*.tsx", "apps/web/app/page.tsx", "apps/web/app/login/**/*.tsx", "apps/web/app/dashboard/page.tsx", "apps/web/components/brand.tsx", "apps/web/components/platform-illustration.tsx", "apps/web/components/shell.tsx", "apps/web/components/sidebar.tsx", "apps/web/components/account-menu.tsx", "apps/web/app/portal/home/page.tsx", "tools/e2e/workspace-polish.spec.ts", "apps/web/app/layout.tsx", "tools/e2e/premium-ui.spec.ts", "apps/web/app/patients/**/chart/*.tsx", "apps/web/app/api/billing/**/*.ts", "apps/web/lib/billing.ts", "tools/e2e/p04-f05.spec.ts", "playwright.config.ts"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-dupe-args": "error", "no-dupe-else-if": "error", "no-duplicate-case": "error", "no-unreachable": "error",
      "no-unsafe-finally": "error", "no-constant-binary-expression": "error", "use-isnan": "error", "valid-typeof": "error",
      "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error", eqeqeq: "error",
    },
  },
];

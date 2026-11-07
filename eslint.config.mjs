import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  { ignores: ["**/node_modules/**", "**/.next*/**", "artifacts/**", "test-results/**"] },
  {
    files: ["packages/domain/src/**/*.ts", "apps/web/lib/**/*.ts", "apps/web/app/api/**/*.ts"],
    languageOptions: { parser: tsParser, globals: { ...globals.node, ...globals.browser } },
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Literal[value=/^(openai|anthropic|@anthropic-ai\\/sdk|@google\\/(generative-ai|genai)|@aws-sdk\\/client-bedrock-runtime|ollama|@ai-sdk)(\\/|$)/]",
        message: "Model SDKs belong in the gateway provider boundary.",
      }, {
        selector: "Literal[value=/https?:\\/\\/(api\\.openai\\.com|api\\.anthropic\\.com|generativelanguage\\.googleapis\\.com)/]",
        message: "Send model requests through the gateway.",
      }, {
        selector: "ImportExpression",
        message: "Declare server dependencies with static imports so the egress boundary can check them.",
      }],
    },
  },
  {
    files: ["packages/domain/src/**/*.ts", "apps/web/lib/**/*.ts", "apps/web/app/api/**/*.ts"],
    ignores: [
      "packages/domain/src/oidc.ts", "packages/domain/src/integrations.ts", "packages/domain/src/gateway.ts",
      "apps/web/lib/foundation.ts", "apps/web/lib/twin-reads.ts",
    ],
    rules: {
      "no-restricted-globals": ["error", ...["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "require"].map(name => ({
        name, message: "Business services use an approved egress boundary.",
      }))],
      "no-restricted-properties": ["error",
        ...["globalThis", "global", "window"].map(object => ({
          object, property: "fetch", message: "Business services use an approved egress boundary.",
        })),
      ],
      "no-restricted-imports": ["error", {
        patterns: [{
          regex: "^(node:)?(http|https|http2|net|tls|dgram|child_process)$|^(undici|axios|node-fetch|got)(/|$)|(^|/)gateway-provider(\\.ts)?$",
          message: "Business services use an approved egress boundary.",
        }],
      }],
    },
  },
  {
    files: ["packages/domain/src/gateway-runtime.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          regex: "^(node:)?(http|https|http2|net|tls|dgram|child_process)$|^(undici|axios|node-fetch|got)(/|$)",
          message: "The runtime must dispatch through the gateway adapter.",
        }],
      }],
    },
  },
  {
    files: ["packages/domain/src/gateway*.ts", "packages/domain/test/gateway.test.ts", "tools/e2e/p10-f03.spec.ts"],
    languageOptions: { parser: tsParser, globals: globals.node },
    rules: { "no-eval": "error", "no-new-func": "error", eqeqeq: "error" },
  },
  {
    files: ["tools/governance/v2/**/*.mjs", "tools/fhir/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
    rules: { ...js.configs.recommended.rules, "no-eval": "error", "no-new-func": "error", "no-implied-eval": "error", eqeqeq: "error" },
  },
  {
    files: ["apps/web/lib/walkthrough-clock.ts", "apps/web/components/workflow-scene.tsx", "tools/e2e/landing-workflows.spec.ts", "packages/domain/src/evidence-ingestion*.ts", "packages/domain/src/evidence-sufficiency.ts", "packages/domain/src/evidence-source-lineage.ts", "packages/domain/test/evidence-ingestion*.ts", "apps/web/components/evidence-sources.tsx", "tools/e2e/p09-f02.spec.ts", "apps/web/app/**/page.tsx", "packages/domain/src/evidence-graph*.ts", "packages/domain/test/evidence-graph*.ts", "apps/web/components/evidence-claims.tsx", "apps/web/app/api/evidence/**/*.ts", "tools/e2e/p09-f01.spec.ts", "apps/web/components/product-walkthrough.tsx", "tools/e2e/landing-motion.spec.ts", "apps/web/components/page-workspace.tsx", "tools/e2e/page-workspaces.spec.ts", "apps/web/components/metric-card.tsx", "tools/e2e/interface-refresh.spec.ts", "packages/domain/src/twin-inspection.ts", "packages/domain/test/twin-inspection.test.ts", "apps/web/lib/twin-inspection-query.ts", "apps/web/components/twin-inspection.tsx", "apps/mobile/src/TwinInspection.tsx", "tools/e2e/p08-f05.spec.ts", "packages/domain/src/twin-refresh*.ts", "packages/domain/test/twin-refresh*.ts", "apps/web/components/twin-operations.tsx", "tools/twin/**/*.ts", "tools/e2e/p08-f04.spec.ts", "apps/web/lib/twin-reads.ts", "tools/platform/twin-reads.test.ts", "packages/domain/src/twin-conflict*.ts", "packages/domain/test/twin-conflict*.ts", "apps/web/components/twin-conflicts.tsx", "tools/e2e/p08-f03.spec.ts", "packages/domain/src/twin-projection*.ts", "packages/domain/test/twin-projection*.ts", "apps/web/components/twin-projection.tsx", "tools/e2e/p08-f02.spec.ts", "packages/domain/src/twin-evidence*.ts", "packages/domain/test/twin-evidence*.ts", "apps/web/components/twin-evidence.tsx", "apps/web/app/api/patient-twin/**/*.ts", "apps/web/app/patients/**/twin/*.tsx", "tools/e2e/p08-f01.spec.ts", "packages/domain/test/timeline-health.test.ts", "tools/e2e/p07-f05.spec.ts", "apps/web/components/timeline-{safety,event-card,source-inspector}.tsx", "apps/web/lib/timeline-presentation.ts", "apps/web/app/api/clinical-timeline/check/**/*.ts", "packages/domain/test/timeline-freshness.test.ts", "tools/platform/timeline-presentation.test.ts", "tools/e2e/p07-f04.spec.ts", "packages/domain/src/timeline-query*.ts", "packages/domain/test/timeline-query.test.ts", "apps/web/components/timeline-explorer.tsx", "apps/web/lib/timeline-query.ts", "apps/web/app/api/clinical-timeline/{query,diff,snapshots}/**/*.ts", "apps/web/app/patients/**/timeline/explore/*.tsx", "tools/e2e/p07-f03.spec.ts", "packages/domain/src/timeline-projection*.ts", "packages/domain/test/timeline-projection*.ts", "apps/web/components/timeline-projection.tsx", "apps/web/app/api/clinical-timeline/projection/**/*.ts", "tools/timeline/**/*.ts", "tools/e2e/p07-f02.spec.ts", "packages/domain/src/canonical-timeline.ts", "packages/domain/test/canonical-timeline.test.ts", "apps/web/components/canonical-timeline.tsx", "apps/web/app/api/clinical-timeline/**/*.ts", "apps/web/app/patients/**/timeline/*.tsx", "tools/e2e/p07-f01.spec.ts", "tools/platform/conformance-routes.test.ts", "packages/fhir/src/conformance.ts", "packages/domain/src/fhir-conformance.ts", "packages/domain/test/fhir-conformance.test.ts", "apps/web/lib/conformance.ts", "apps/web/lib/r4-negotiation.ts", "apps/web/components/conformance-workspace.tsx", "apps/web/app/interop/conformance/**/*.tsx", "apps/web/app/api/integrations/conformance/**/*.ts", "apps/web/app/api/fhir/r4/**/*.ts", "tools/platform/conformance-http.test.ts", "tools/e2e/p06-f05.spec.ts", "packages/domain/test/batch*.ts", "apps/web/components/reconciliation-workspace.tsx", "apps/web/app/interop/reconciliation/**/*.tsx", "apps/web/app/api/integrations/reconciliation/**/*.ts", "tools/e2e/p06-f04.spec.ts", "packages/domain/src/db.ts", "tools/platform/partner-receiver.test.ts", "packages/domain/src/integration*.ts", "packages/domain/test/integration*.ts", "apps/web/lib/integrations.ts", "apps/web/components/partner-workspace.tsx", "apps/web/app/interop/partners/**/*.tsx", "apps/web/app/api/integrations/partners/**/*.ts", "tools/integrations/**/*.ts", "tools/platform/integrations-http.test.ts", "tools/e2e/p06-f03.spec.ts", "packages/contracts/src/index.ts", "tools/platform/smart-http.test.ts", "packages/domain/src/smart*.ts", "packages/domain/test/smart*.ts", "apps/web/lib/smart.ts", "apps/web/components/smart-app.tsx", "apps/web/app/interop/apps/**/*.tsx", "apps/web/app/api/smart/**/*.ts", "apps/web/app/.well-known/**/*.ts", "tools/e2e/p06-f02.spec.ts", "packages/domain/src/fhir-source*.ts", "packages/domain/test/fhir-source*.ts", "apps/web/app/interop/source/**/*.tsx", "apps/web/app/api/integrations/r4/**/*.ts", "apps/web/components/fhir-source-preview.tsx", "apps/web/lib/fhir-source.ts", "tools/fhir/**/*.ts", "tools/platform/fhir-source-http.test.ts", "tools/e2e/p06-f01.spec.ts"],
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

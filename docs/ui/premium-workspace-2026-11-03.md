# CuraSphere UI refinement — 2026-11-03

Implemented locally on experimental/phase-03-local. No source publication, deployment, governance adoption, or clinical activation is part of this UI change.

## Experience

- Public enterprise landing page at `/` with original code-native graphics, responsive sections, platform navigation, and workspace/portal entry points. Illustrations are explicitly synthetic; no customer logos, clinical outcome claims, or compliance certifications are implied.
- Dedicated login at `/login`, retaining the existing organization identity-provider flow and backend-controlled local directory. Synthetic development access is disclosed separately in an expandable section with an accessible identity selector.
- Shared teal and warm ivory workspace theme, new brand treatment, refined sidebar, cards, table headers, and dashboard welcome area. Access filtering and clinical data logic are unchanged.
- Existing error links to `/?error=...` forward to `/login` with their error code preserved. Authenticated users retain the root-to-dashboard redirect.
- Simulation context and clinical restrictions remain available in account details and on clinical records; the global engineering banner was removed in the subsequent operational-copy refinement. Existing governance records and approvals are untouched.

## Verification

- Production build: passed (182 generated pages/routes).
- Web TypeScript: passed.
- Existing lint and targeted lint for all changed UI components and new browser tests: passed.
- Production browser suite: 4/4 passed. Existing appointment/encounter/clinical entry/billing flow, role separation, tenant denial, empty chart state, enterprise landing navigation, login and synthetic session flow.
- Axe accessibility checks: zero violations on landing and login at 1440px and 390px, dashboard, desktop/mobile chart, and billing charge detail. Responsive landing/login/chart checks show no horizontal overflow.
- Screenshots and actual browser reports: ignored local `artifacts/governance-v2/premium-ui/`, including `production-results.json`. Earlier development-run results are retained separately; a dev-server account-menu timeout did not recur against the completed production build.

## Local preview

Web production build runs at http://127.0.0.1:3000 with local synthetic flags. Mobile development server remains separate and unchanged. This changes the responsive web application; the native mobile application has not been redesigned.

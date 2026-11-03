# Mobile workspace parity — contract v1

Scope: isolated local synthetic engineering. Formal Phase 04 remains NOT_STARTED; Phase 05 remains PLAN_ONLY. No production clinical use, deployment, signatures, or governance adoption is implied.

## Architecture

The main Care team workspace now reads the same SQLite chart domain as the web application through `/api/mobile-workspace/*`. Foundation remains responsible for directory identities and sessions. The web domain remains authoritative for patients, appointments, visit encounters, clinical source entries, work coordination, and billing. No clinical data is copied into the foundation service or the device.

The existing foundation clinic tools remain available under Connection settings, explicitly identified as a separate service workspace. The patient app continues to use the existing `/api/patient-app/*` domain; its web preview now has restricted CORS support. The mobile theme uses the same teal, ivory, border, and typography direction as the web redesign.

## Endpoints

All responses use `Cache-Control: no-store`. Native clients send no Origin; local browser previews may use the same requested host on port 8082. Forwarded-host headers are not trusted. CORS grants neither wildcard origins nor cookie credentials.

- GET directory: available local synthetic identities, dataClass synthetic, contractVersion 1.
- POST session: JSON userId only; role, organization, and facility are resolved by the server. Returns a memory-only bearer session and effective permissions. Unknown/inactive users or memberships are refused.
- GET dashboard: the same permission-scoped readDashboard result used by web.
- GET patients?q=: current facility registrations; 80-character search bound; up to 50 matches.
- GET appointments: current scheduling records, up to 50 ordered by start time.
- GET work: current permission-scoped pending orders, tasks, referrals, and plans.
- GET charges: financial records only with billing.charge.read.
- GET chart/:patientId: the existing unified chart, including denied/failed section markers. Clinical source values, component units, and financially restricted status use the existing domain boundaries. Foreign-facility and foreign-tenant records are refused.
- POST signout: revokes the foundation session. Subsequent data requests return 401.

Protected endpoints accept explicit Authorization bearer headers, not cookies or session IDs in URLs. Account status, foundation expiry, bound-session status, memberships, and effective permissions are checked on each request. The entire adapter calls the existing local healthcare sandbox guard before processing requests. There are no clinical or financial write endpoints in this adapter.

## Mobile interaction

Care team panels provide dashboard totals, patient search, unified chart, visit list, pending work, charges where permitted, and account information. Refresh/error handling invalidates late responses and clears stale displayed results. Sessions and record content are held in component memory, never AsyncStorage. AsyncStorage retains only onboarding and server-host preferences.

Editing opens the existing authenticated web workflow in the browser. It requires a web sign-in and receives no token through the URL. This preserves existing concurrency, idempotency, audit, and clinical safeguards without introducing a second command implementation. This is source-data/read parity, not native form parity or offline clinical access.

## Verification and limitations

Evidence lives under ignored local artifacts/governance-v2/mobile-workspace and premium-ui mobile logs. Tests use the running foundation and web services with actual synthetic records. Failed-origin and authorization tests do not substitute a mock clinical data source. The browser test injects a 503 solely to verify stale-view clearing.

An Android Hermes bundle export validates native compilation, not behavior on a physical device. Browser QA runs the Expo web preview at 390x844. No Android emulator or iOS device is configured in this environment, so hardware interaction and platform screen-reader behavior remain unverified. No application was submitted, published, or deployed.

## Operations and recovery

Run the web service on port 3000 with the existing local synthetic flags, and Expo on port 8082. Connect a local device using the server's LAN address through Connection settings. Open Care team and choose a synthetic identity. Requests must remain inside the authorized local simulation environment.

Run npm run test:e2e:mobile for API and browser coverage, npm run typecheck --prefix apps/mobile and npm run lint --prefix apps/mobile for static checks, and node --import tsx --test tools/platform/mobile-origin.test.ts for origin normalization coverage. Android export uses the installed Expo CLI with output under artifacts/governance-v2/mobile-native-export; it is not an Expo cloud build or deployment.

If the bridge is unavailable, the app reports the failed view and offers retry. It never falls back silently to foundation charts or invented values. No database migration or clinical-record rewrite is needed to disable this read adapter. Retain the existing web workflow and data if rolling back mobile presentation changes.

## Final local result — 2026-11-03

- Mobile API/browser suite: 4/4 passed, including real-source reads, foreign-tenant denial, clinical/financial separation, origin controls, malformed input, post-signout denial, and failed-view clearing. Mobile dashboard and chart scans reported zero WCAG A/AA violations with no page errors.
- Existing web workflow/UI browser regression: 4/4 passed.
- Mobile TypeScript and lint: passed. Web production build and targeted adapter lint: passed.
- Requested-host normalization regression: 1/1 passed.
- Android export: succeeded, producing a Hermes bundle locally. No physical device was tested.

Main Care team preview: http://127.0.0.1:8082. Web workflow: http://127.0.0.1:3000. Changes remain uncommitted and have not been pushed.

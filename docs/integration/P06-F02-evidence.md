# P06-F02 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Local synthetic engineering; no formal phase acceptance, clinical/licensing signoff or production release is inferred. The implemented subset and boundaries are described in the [contract/runbook](P06-F02-architecture-and-operations.md), [risk controls](P06-F02-risks.md) and [ADR-0072](../adr/ADR-0072-local-smart-patient-grants.md).

## Completed code

Schema 49 provides real tenant-owned app registrations, pending approvals, immutable patient-context grants, hashed one-time codes and hashed short-lived bearer tokens. Exact redirect/audience, S256 PKCE, original-session/nonce binding, current role/purpose/source authority, code replay revocation, disable/revoke and bearer-only resource access are implemented. Browser/client state is validated; no scope or patient context comes from a trusted-looking app assertion alone.

The Interoperability app manager, actual patient approval/denial, memory-only demo client, grant review/revoke and isolated partner-origin flow use persisted data and real HTTP. Cold starts retain the original authorization request while the user signs in through the unchanged login/MFA flow in a separate tab, then explicitly continues and approves. No app access is created by sign-in alone.

F01 source transform patch 1.0.1 excludes transport correlations that could contain historical session identifiers; stored clinical rows are retained. Delegated views omit the proprietary source-context extension and its profile assertion. The source StructureDefinitions remain 1.0.0; clinical field/state fidelity is unchanged. Earlier internal previews must be reloaded after the patch.

## Actual verification

| Verification | Observed result / local artifact |
| --- | --- |
| `npm test` | 459 pass, zero failures — `P06-F02-domain-final.log` (includes nine SMART scenarios and all prior domain suites) |
| `npm run smart:test` | 12 pass — nine domain scenarios plus three HTTP/proxy security tests — `P06-F02-smart-http.log` |
| SMART Playwright | Four scenarios pass, including actual cold login/redirect and real partner HTTP server — `P06-F02-browser-cold.log/json` |
| Source-preview Playwright regression | Both P06-F01 scenarios pass after the privacy patch — `P06-F02-browser.log` / `P06-F02-browser-final.log` |
| Landing/workspace UI regression | Five pass — `P06-F02-ui-regression.log/json` |
| Mobile browser/API regression | Four pass after the proxy hostname isolation change — `P06-F02-mobile.log` |
| Governance | 16 + 10 pass — `P06-F02-governance.log`, `P06-F02-governance-local.log` |
| Build | Pass — `P06-F02-build-verified.log`; final Interoperability wording compilation in `P06-F02-build-release-local.log` |
| Workspace typecheck | Contracts/domain/FHIR/web pass — `P06-F02-typecheck-final.log` |
| Lint | Pass — `P06-F02-lint-verified.log` |
| Official HL7 CLI 7.0.4, R4 4.0.1, `-tx n/a` | Six expected outcomes pass — `P06-F02-validator/summary.json`, original logs and OperationOutcomes |
| Schema/preservation comparison | 48 → 49; every original row/compound key and complete row value preserved across nine clinical/provenance tables — `P06-F02-preservation.json` |

Artifact names are under `artifacts/governance-v2/`. Browser artifacts use distinct output directories, preserving preceding failed-run diagnostics. CI is configured to run the SMART/source and HTTP suites plus delegated-resource validation; no unexecuted remote CI result is claimed.

Official validation positives: Patient zero errors/one warning; eight-resource source bundle zero/18; nine-resource lifecycle bundle zero/20; delegated app bundle zero/18. The deliberate missing-birth-date and executable-ServiceRequest fixtures each produce the expected one error. Warnings for absent complete narratives and unknown synthetic terminology remain visible. No licensed terminology validation, US Core or SMART certification is claimed.

## Scenario oracles

1. Actual administrator registration, clinician approval, PKCE exchange and patient read persist; only hashes are stored for codes/tokens. Registration retry returns the same client; metadata cannot be rewritten under the same key.
2. A patient/Patient.r token cannot read a real persisted Observation. Scope denial occurs before source lookup. A real different-patient HTTP read also fails, despite the user's underlying access to that patient.
3. Wrong purpose/facility/tenant/session, disabled client, suspended user, logout, expired code and expired/revoked token fail closed. Restoring the dependency allows only still-valid authority to recover.
4. Wrong proof burns the code; replay revokes an already-issued grant. Two separate SQLite processes issue one token total and persist the replay revocation.
5. Request nonce/session, exact redirect/audience, permitted scope set and S256 are enforced; forged state/redirect, wildcard/write/offline scope and plain PKCE are rejected. Denial creates no grant or code.
6. File-backed reopen retains effective grant/revocation state. A deliberately colliding schema-49 table rolls the migration back to 48 without partially created SMART tables or patient loss; retry succeeds after repairing the fixture collision.
7. App responses contain no private source-context/session string; error handling exposes no SQL or clinical error values. Forms reject unsupported media/fields, duplicate singleton fields and oversized bodies. The shared hostname policy blocks login/cookie issuance on client hosts.
8. Browser app goes through actual allow → exchange → read → insufficient-scope denial → revoke → 401. Accessibility checks and 390-pixel containment pass; screenshots are in `P06-F02/app-desktop.png` and `app-mobile.png`.
9. A real local partner HTTP server on an ephemeral port receives no workspace cookie, reads through actual browser CORS with its bearer, and cannot serve workspace login. Its cold-start launch preserves the original state through the separate sign-in tab and receives/redeems the actual approval code.

The consistent before snapshot is `P06-F02-before-1b158030-4990-4890-81d1-59afe2c2e212.sqlite`. All original patients (21), encounters (33), conditions (9), allergies (10), observations (27), medication drafts (9), orders (13), coding definitions (9) and compound-key coding pins (47) remain byte-for-byte unchanged in their rows. The two source UI regressions add new synthetic encounter/source records; none replace historical records. SMART itself adds security metadata, not clinical writes.

## Defects found and corrected

Native forms initially sent Origin:null under no-referrer and were correctly denied. Workspace app pages now preserve same-origin form origin; callback code privacy remains stricter, and opaque origins are still denied. React rejected SQLite null-prototype app rows passed to a client component; the client list now returns plain DTOs. Browser dropdown tests were changed to their actual accessible combobox names. The standalone callback/error view also received a valid skip-link target. None of these failures was counted as a pass.

Review additionally closed the cookie-port trust gap by restricting partner callback hostnames and denying the workspace on that namespace, including forwarded hosts and older registrations revalidated on use. Internal correlation metadata is no longer exported as patient provenance, preventing a delegated app from inheriting session authority.

## Remaining boundaries

This completes the local read-only workforce/patient SMART-style feature. Search, writes, refresh/offline, user/system scopes, OIDC identity tokens, EHR launch, native-device verification, full standards certification, high-volume resolver optimization, legal external sharing, partner import/webhooks and production activation are not claimed. The resolver explicitly rejects contexts above its documented local candidate bound; it does not silently truncate data. F03–F05 remain NOT_STARTED. Formal and qualified reviews remain separate, with no invented reviewer identity. No push, merge, publication or deployment was performed.

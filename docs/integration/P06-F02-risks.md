# P06-F02 risk and privacy controls

Conservative engineering class C; local synthetic implementation evidence, not a qualified clinical review or production release approval.

| Hazard | Implemented control | Evidence |
| --- | --- | --- |
| App inherits a user's full workspace cookie authority | Distinct opaque SMART token; no cookie fallback at resource server; exact patient/type scopes plus current source permissions | Scope-denied real observation test; cookie-only HTTP read denied; actual allowed Patient read |
| Code interception/replay expands authority | Mandatory S256 proof, exact registered redirect/client/audience, 60-second single-use code; replay revokes grant | Bad-proof and replay tests; two processes issue one token and persist revocation |
| A loopback client receives workspace cookies across ports | Dedicated reserved client hostname namespace; workspace refuses it on every route; canonical built-in callback is trusted first-party code | Real partner HTTP server/browser CORS test receives no workspace cookie; login on reserved host denied; same-host port registration rejected |
| App grants become all-patient, cross-tenant or stale identity access | Immutable tenant/facility/user/purpose/patient context; fresh original identity, current policy and source ownership every read; post-read patient-ref check | Real other-patient HTTP read denied; wrong tenant/facility/purpose/session unit cases; logout, suspension and role guards |
| Clinician approves an unsolicited or changed request | Session-bound approval nonce and pending state; exact scopes/redirect shown; browser state and PKCE; framing denied | Forged nonce/state/redirect/audience failures, actual allow/deny and cold sign-in continuation |
| Transport credentials escape in clinical provenance | F01 transform patch 1.0.1 excludes transport correlations; delegated base-R4 omits internal source-context entirely | Session-string absence oracles and official delegated-resource validation |
| Revoked/expired app continues reading | Five-minute upper lifetime, client version/disable, terminal grant revoke, live original-session checks | Revoke then actual HTTP 401, code/token expiry, disabled client/user, logout and reopen tests |
| A dependency failure creates fake authority or leaks errors | Fail closed; private/no-store responses, generic SQL-error handling; no cached identity fallback | Dependency recovery, malformed/oversized form, HTTP redaction and actual network/status reporting |
| Browser protection changes break legitimate consent/forms | Same-origin form policy with opaque origins still rejected; no-referrer callback, removed code query before fetch | Initial native-form Origin:null failure corrected and browser regression rerun |
| Structural validity is mistaken for clinical/terminology acceptance | Read-only local subset; no execution/transmission; synthetic coding namespaces and unfiltered validator warnings; no SMART certification claim | Existing clinical restrictions and full domain/governance regression; official R4 reports |

Runtime app approval is a scoped security decision under existing treatment authority, not patient consent to external sharing or qualified clinical/licensing signoff. External partner import/delivery, production TLS/client assurance/retention policies and SMART features not advertised by discovery remain outside this implementation. No real PHI, live clinical provider, publication or production enablement is authorized here.

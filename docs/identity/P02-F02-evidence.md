# P02-F02 evidence

Date: 2026-10-13

P02-F02 is accepted as an engineering record. Phase 02 is not accepted. No architecture, security, or clinical reviewer has signed it. P02-F03 has not started.

## Runtime before the change

The reconciliation in `docs/identity/P02-F01-runtime-reconciliation.md` restarted foundation onto Flyway V16. Health stayed `schemaVersion` 15 after the identity work. `GET /api/auth/health` returned 200 `{"ok":true,"code":true}`. Dex discovery is `http://127.0.0.1:15556/dex`.

## Commands

`npm run typecheck --workspace @curasphere/domain` exited 0.

`npm run typecheck --workspace @curasphere/web` exited 0.

`node --import tsx --test --test-concurrency=1 packages/domain/test/oidc.test.ts` exited 0. 17 passed, 0 failed. That run included a real Dex password login, a wrong password, a tampered state, a replayed code, a bad PKCE verifier, session rotation and revocation, two facilities for the Ghana nurse, a disabled Harborlight organization, TOTP enrollment, lockout, revocation, refresh rotation, refresh reuse, one winner of two concurrent refreshes, membership removal, a rejected return address, events without the refresh token, issuer, audience, expiry, a bad signature, an unsigned token, an attacker key URL, idle and absolute expiry, a reopened database file, a passkey response without a challenge, a stopped Dex, a failed in-flight code, a new login after Dex returned, and rejection of the token signed by the previous Dex keys.

`npm test --workspace @curasphere/domain` then exited 0. 103 passed, 0 failed, including the OIDC scenarios and schema version 29.

`npm audit --workspace @curasphere/domain` printed `found 0 vulnerabilities`. `npm audit --workspace @curasphere/web` printed `found 0 vulnerabilities`.

## Browser

On `http://localhost:3000`, Sign in opened the Dex password form. Amira Solano's Dex password reached `/dashboard` with Harborlight Health and Riverside Clinic only. Logout returned to the sign-in page. A second Dex login, after a passkey was enrolled, stopped at `/auth/mfa`. `/auth/passkey` then reached `/dashboard` using a virtual authenticator. `/auth/enroll` showed the passkey revoke control. TOTP enrollment showed a secret and accepted the current code. The organization page still listed only Harborlight Health.

Chrome refused passkey registration on `http://127.0.0.1:3000` with an invalid-domain error. The relying party and callback are localhost for that reason.

## Limits

The development directory still opens a session without Dex when `CURASPHERE_ENV` is not production. Identity rows are in the chart database at schema 29, not in foundation Flyway. Dex does not perform TOTP or passkeys. One development request log contained an authorization code before `next.config.mjs` ignored `/api/auth/callback`. Later callback lines did not include the query. Starlette findings on the separate AI gateway were not changed. This record is not a certification or a production approval.

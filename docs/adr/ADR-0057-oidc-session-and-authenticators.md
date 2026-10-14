# ADR-0057: Local workforce sign-in uses Dex authorization code with PKCE, then an application session

Status: Accepted
Date: 2026-10-13

## Context
P02-F01 stores the active organization and facility on the server session. Workforce sign-in still had a development directory that opens a foundation session without a password. Phase 02 requires an identity provider, a verified token, a server-side session, and a second factor. The pinned provider is Dex `v2.42.0` in `infra/local/dex.yaml`.

Dex discovery was read from `http://127.0.0.1:15556/dex/.well-known/openid-configuration`. It advertises `authorization_code`, `refresh_token`, `device_code`, and token exchange. The only response type is `code`. ID tokens are RS256. Scopes include `openid`, `email`, `profile`, and `offline_access`. The password connector stores users in memory and does not advertise MFA, `amr`, `acr`, or WebAuthn. Implicit and password grants are not used.

## Decision
Dex authenticates the password and issues the authorization code, ID token, access token, and refresh token. CuraSphere does not trust email, groups, or any tenant claim from Dex. The stable identity is the pair of issuer `http://127.0.0.1:15556/dex` and the Dex subject. That subject is not the user id. For the local connector it is the unpadded base64url protobuf of the user id and the connector id `local`.

The browser uses the authorization-code flow with PKCE S256 through `openid-client` 6.8.8. The redirect is pinned to `http://localhost:3000/api/auth/callback`. State, nonce, and the code verifier live in `auth_transactions` and in an HttpOnly `cura_auth` cookie. The token endpoint exchange checks the issuer, the audience `curasphere-local`, RS256, expiry, not-before, and the signature against the Dex JWKS URL under that issuer. Tokens with `alg` other than RS256, or with `jku`, `x5u`, or `jwk`, are rejected. A restarted Dex process rotates its memory keys, so a token from the previous process fails and a new login succeeds.

A usable session is opened only when `external_identities` has an active row for that issuer and subject and the user has an active membership on an active organization. An unknown subject stays pending and gets no session. The browser cookie `cura_session` is the foundation session id. Provider tokens stay in the chart database `auth_sessions` row. Refresh tokens rotate. Presenting the previous refresh token revokes that session. Dex itself rejects reuse and lets one of two concurrent refreshes win.

Dex cannot enroll TOTP or passkeys. The application does both after the OIDC login. TOTP uses `otpauth` (SHA1, 6 digits, 30 seconds, window 1). Five failures lock the authenticator for 15 minutes. Eight one-time recovery codes are stored as hashes. Passkeys use `@simplewebauthn/server` and `@simplewebauthn/browser`. The relying party id is `localhost` and the origin is `http://localhost:3000`. Chrome rejects `127.0.0.1` as a relying-party id, which is why the callback host is localhost. Registration and authentication check the origin, relying-party id, challenge, credential, and signature counter.

The development directory remains available only when `CURASPHERE_ENV` is not `production`. It does not create an `auth_sessions` row. A bound session that is revoked, idle for 30 minutes, older than 12 hours, or whose membership is gone is closed and cannot be reused.

## Consequences
Identity tables are chart schema 29, not a foundation Flyway migration. The foundation cookie is still the browser session. Rollback of schema 29 is restore of the chart database from the copy taken before migrate. The live chart file is not deleted. No architecture, security, or clinical reviewer has signed this decision. It is not a certification, a medical-device authorization, or a production identity deployment.

## Revisit trigger
Move identity tables into the foundation database when a later feature requires one store. Replace application TOTP and passkeys if a reviewed identity provider is approved that performs those ceremonies itself. Do not treat this local Dex password as a production authenticator.

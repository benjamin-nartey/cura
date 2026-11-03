# P02-F05 evidence

Date: 2026-10-14

P02-F05 is accepted as an engineering record. It is not a clinical deployment approval. Production and staging refuse the development emergency policy. No architecture, security, or clinical reviewer has signed.

## What was exercised

Kwame Boateng at Accra Central Medical Centre requested read-only access to synthetic record `syn_kojo_agyeman`. The record text states that it is not a diagnosis, a treatment recommendation, or a clinical chart. Ama Mensah was not used as the clinician. Esi Boateng, an auditor, reviewed the case. Yaa Asare, the East Legon receptionist, had no emergency navigation entry. A direct visit to `/emergency` said only that the record is not available.

The browser journey on `http://localhost:3000` showed the restriction, the justification form, a real TOTP step-up, the `Emergency Access Active` banner with scope, remaining time, expiry, and request reference, the synthetic sentence, End Emergency Access, and a history row for that requester only. Kwame's visit to `/emergency/reviews` was denied. Esi opened the queue, saw the justification and the action timeline, recorded `closed_appropriate`, then escalated. The disposition event remained in the timeline after escalation. The review page did not show the synthetic record body. The local alert row was `captured` on channel `local-sandbox` for `usr_gh_reviewer`.

## Commands

`npm test --workspace @curasphere/domain` exit 0. 206 passed, 0 failed. That run includes P02-S99 through P02-S142 in `packages/domain/test/emergency.test.ts`, plus the earlier Phase 02 domain tests and the Dex OIDC tests.

`npm run typecheck --workspace @curasphere/domain` exit 0.

`npm run typecheck --workspace @curasphere/web` exit 0.

`npm run build --workspace @curasphere/web` exit 0 after the emergency routes were on disk. The route list includes `/emergency`, `/emergency/justify`, `/emergency/verify/[id]`, `/emergency/active`, `/emergency/ended`, `/emergency/history`, and `/emergency/reviews`. An earlier build in the same session started before those files existed and is not the acceptance build.

`npm audit --workspace @curasphere/domain --omit=dev` exit 0, 0 vulnerabilities. `npm audit --workspace @curasphere/web --omit=dev` exit 0, 0 vulnerabilities.

## Scenario notes

P02-S107 built an ES256 assertion and passed it through `finishPasskeyAuthentication`. P02-S141 in the domain suite checks that the synthetic summary is non-clinical. The browser journey above is the user-facing pass for that scenario. P02-S142 sets `CURASPHERE_ENV=production` and expects eligibility to fail.

## Limits

The 5 minute freshness window and 15 minute duration cap are proposed engineering values. The alert outbox is a local sandbox. Chart schema 32 is additive. Foundation Flyway remains version 16. Phase 03 is not started.

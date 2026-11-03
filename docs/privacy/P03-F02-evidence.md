# P03-F02 experimental evidence

This is experimental engineering evidence. Formal Phase 03 remains NOT AUTHORIZED. DEV-GOV-2026-001 remains PROPOSED. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`.

## What was built

Chart schema 34 stores synthetic consent subjects, authorities, directives, immutable versions, withdrawals, policies, queued dispatches, and a local sink. `evaluateConsent` runs after RBAC for communication, outbound sharing, and research. A consent allow cannot create a permission the role does not have. Withdrawal writes a new version, blocks queued jobs, and is read again before a local sink delivery.

The synthetic subject is `sub_akua_boateng` at `org_demo_gh` / `fac_gh_accra`. The privacy workflow actor is `usr_gh_privacy`. The auditor is `usr_gh_reviewer`. The receptionist denial persona is `usr_gh_reception`. Policy context is `synthetic-development` version 1. No Ghana or Europe legal rule was invented.

## Browser workflow

Signed in as Kojo Asante through the local directory. The overview was empty. A communication directive for Akua Boateng was recorded as `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8`, verified, and activated at version 2. The inspector returned allow / consent-granted. Research returned deny / consent-missing. A reminder was queued. Withdrawal moved the directive to version 3 and the queued job to blocked / consent-withdrawn. A later inspector call returned deny / consent-withdrawn. History showed created, activated, and withdrawn.

Esi Boateng opened that history and the detail page. The page had no verify, activate, queue, or withdraw controls. Yaa Asare opened the same URL and saw “Consent records are limited to authorized staff.” The navigation did not offer Consent. The session was ended.

A new process reopened `data/curasphere.sqlite`. Schema was 34. The directive was still withdrawn at version 3. Evaluation was deny / consent-withdrawn. The access ledger for `org_demo_gh` was intact. The consent ledger rows did not contain the display name Akua Boateng.

## Commands

- Consent and ledger tests after the rollback fix: 27 passed, exit 0.
- `npm test --workspace @curasphere/domain`: 236 passed, 0 failed, exit 0.
- `npm run typecheck --workspace @curasphere/domain` and `@curasphere/web`: exit 0.
- `npm run build --workspace @curasphere/web`: exit 0. Consent pages and API routes were in the route list.
- `npm audit --workspace @curasphere/domain` and `@curasphere/web`: 0 vulnerabilities, exit 0.

## Scenarios

S01–S32 passed in `packages/domain/test/consent.test.ts`, including the grouped purpose, withdrawal, cache, outage, restart, and ledger cases. S33–S36 passed in the browser session above. No unexecuted scenario is marked passed.

## Residual limits

Retention and legal hold are not decided. That is P03-F03. FHIR R4 mapping is not implemented, so no conformance is claimed. The foundation directory rows for Kojo Asante and Esi Boateng were inserted into the local database already used by the foundation service. They are not a Flyway migration. A rebuilt foundation database would need the same local insert before those names appear on the sign-in list. The chart seed still creates the privacy-officer permissions when `org_demo_gh` exists.

Hosted CI remains unverified. The 44 high Debian findings in the gateway image remain open. Production and staging clinical processing stay disabled.

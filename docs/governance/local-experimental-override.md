# Local experimental override

This override lets local engineering continue into Phase 03 while Phase 02 human reviews are still pending. It is a Product Owner instruction for experimental development. It is not a constitutional approval, and it does not activate DEV-GOV-2026-001.

## Gate that local coding bypasses

Formal progression is refused by `activationDecision` in `tools/governance/lib.mjs`. That function always returns `developmentException: PROPOSED` and `phase03Development: NOT_AUTHORIZED`. `tools/governance/review-dev.mjs` writes those same values and does not start Phase 03. `tools/constitution/validate-decision.mjs` still requires distinct architecture, security, and clinical reviewer names and timestamps before an accepted decision. The phase register keeps Phase 02 `IN_PROGRESS` and Phase 03 `NOT_STARTED`, with `human_authorization_to_start_next` null.

`npm run governance:local-experiment` is a separate command. It does not change those rules. When `CURASPHERE_LOCAL_PHASE_OVERRIDE=true` and the sandbox checks pass, it reports `EXPERIMENTAL_DEVELOPMENT_ACTIVE` and names the feature that may be implemented. Pending human reviews stay `PENDING`. They are never reported as `PASS`.

## Why this is not governance authorization

The experimental status is not `ENGINEERING_ACCEPTED`, `GOVERNANCE_ACCEPTED`, `DEVELOPMENT_EXCEPTION_ACTIVE`, or `PRODUCTION_AUTHORIZED`. The runner does not write signature files, does not fill P02-R01 through P02-R06, does not change the amendment `DEV-GOV-2026-001`, and does not set formal Phase 03 to approved. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`.

## Restrictions

All of these are required:

- `CURASPHERE_ENV=local`
- `CURASPHERE_DEV_DIRECTORY=local-test`
- `CURASPHERE_DATA_CLASS=synthetic`
- `CURASPHERE_LOCAL_PHASE_OVERRIDE=true`
- no production database URL, production credential flag, real patient-data flag, publish flag, external healthcare connection, or clinical emergency flag

`NODE_ENV=development` alone is not enough. `apps/web/next.config.mjs` refuses to start when the override is enabled outside that sandbox. `infra/delivery/deploy.sh`, `infra/delivery/simulate.sh`, and the CI workflow reject the override before a deployment. The 44 high Debian findings and the unverified hosted CI result stay open in the experimental report.

## Enable and disable

Enable only in a local shell:

```
CURASPHERE_ENV=local
CURASPHERE_DEV_DIRECTORY=local-test
CURASPHERE_DATA_CLASS=synthetic
CURASPHERE_LOCAL_PHASE_OVERRIDE=true
npm run governance:local-experiment
```

Disable by unsetting `CURASPHERE_LOCAL_PHASE_OVERRIDE` or setting it to `false`. The next run reports `EXPERIMENTAL_DEVELOPMENT_INACTIVE` and permits no feature. Formal Phase 03 stays `NOT_AUTHORIZED`.

## Isolation

Experimental work is on branch `experimental/phase-03-local`. It is not pushed and is not a release branch. Deployment scripts exit before publishing when the override is set. Formal Phase 02 evidence and signature records are not the experimental register. The experimental register is `docs/governance/experimental-engineering-register.json`.

## Remaining human signatures

P02-R01 architecture, P02-R02 security, P02-R03 clinical safety, P02-R04 clinical role matrix, P02-R05 clinical emergency policy, and P02-R06 product-owner phase acceptance are pending. No reviewer name or decision time is recorded. The product owner instruction that created this override does not sign those reviews.

## Risks

The override can be mistaken for permission to deploy. The deployment scripts and the startup check refuse that path. It does not bypass authentication, authorization, tenant isolation, audit, or the production emergency denial. Reconciling this branch later still requires the unsigned human reviews and a separate decision to accept the Phase 03 work.

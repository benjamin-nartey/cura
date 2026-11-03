# Product owner instruction — P04-F01 local experiment

Recorded: 2026-10-15.

The product owner explicitly authorized experimental engineering of P04-F01, Patient and Practitioner Master Records, in the isolated local environment.

This instruction is not a constitutional amendment, not formal Phase 04 acceptance, not a clinical governance approval, and not a production release. DEV-GOV-2026-001 stays PROPOSED. P02-R01 through P02-R06 stay PENDING. Formal Phase 03 stays NOT_AUTHORIZED. Formal Phase 04 stays NOT_STARTED. The amendment hash is unchanged.

The controlling scope remains `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md`. The local runner may permit `P04-F01` only. P04-F02 through P04-F05 are not permitted.

Required sandbox flags remain `CURASPHERE_LOCAL_PHASE_OVERRIDE=true`, `CURASPHERE_ENV=local`, `CURASPHERE_DEV_DIRECTORY=local-test`, and `CURASPHERE_DATA_CLASS=synthetic`. Staging, production, real patient data, production credentials, external healthcare connections, and deployment stay refused.

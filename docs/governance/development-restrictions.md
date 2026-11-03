# Development restrictions

These restrictions apply to any work done under `CURASPHERE-DEV-GOVERNANCE-v1`. They are in force now because the exception is not active, and they would remain in force if it were later activated.

- Synthetic or fictional data only. No real patient records.
- No production clinical deployment and no staging clinical break-glass.
- No real clinical use, and no autonomous diagnosis or treatment.
- No unauthorized external healthcare integration and no production credentials.
- No real patient information sent to an AI provider.
- No bypass of authentication, tenant isolation, audit, or privacy controls.
- No unapproved clinical permission turned on for real use.
- No automatic promotion from development to staging or production.
- Emergency access in code stays limited to a development policy for `SyntheticRestrictedRecord` / `synthetic.read`.
- Five-minute step-up freshness and a fifteen-minute grant cap are engineering defaults, not approved clinical policy.

## Enforcement

`npm run governance:review:dev` reads the source files and the approval register. It fails if production or staging emergency elevation is no longer denied, if the organization-administrator billing and audit correction is removed, if a requester can be recorded as their own emergency reviewer, or if a Phase 02 review is no longer `PENDING`.

The runner refuses to mark `DEV-GOV-2026-001` active. Activation requires a signed authorization file whose amendment hash matches `docs/constitution/amendments/DEV-GOV-2026-001.md`, with distinct architecture, security, and clinical names plus a product-owner statement. That file is not created by the runner.

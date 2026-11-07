# P10-F02 Gateway policy and PHI controls

This local synthetic implementation requires an active control-plane prompt and registered provider/model tuple. A dispatch approval lives in the prompt version's existing schema JSON under `dispatchPolicy`. Version 1 binds the tenant, facility, jurisdiction, session purpose, provider, model ID, model version, synthetic data class, and a bounded list of approved fixture inputs. Schema 59 supports the existing storage. Policy authoring and publication belong to the subsequent lifecycle feature.

The gateway rechecks the local session, active account and tenant, facility, and memberships before dispatch. The current fixture jurisdiction is `local-synthetic`. Active session context and role must agree with the request context. Missing or incompatible approvals, an unavailable tenancy dependency, and adapters outside the versioned factory boundary fail closed. The existing registry and quota decisions apply before transport.

The gateway redacts recognized identifiers and compares the result against the registered fixture values. It sends the matching registered value. Unapproved free text is refused even if it contains no recognizable identifier pattern. Attempts store an input digest and outcome. The access ledger and audit event record refusals, and the outbox retains trace and version metadata. The Gateway attempt view exposes outcomes and reason codes through its existing controls.

Accepted receipts require the original actor and facility, the current authorization, and a matching fingerprint of the approved prompt schema. Revoked access or changed approval produces an audited refusal with empty output. Existing receipts and history remain immutable. A disabled prompt is the local rollback switch. Retain the current replay checks when serving receipts created under this policy.

## Verification

- The gateway, agents, evaluation, coordination, facility, lab, operations, patient, and prescription suites passed all 26 tests with the repository's `dev-env.ts` preloader. The final gateway-only rerun passed all seven tests.
- The denied-input scenario used a synthetic name and birth date. It verified zero adapter calls, zero quota use, empty outputs, denial audits, and metadata-only events. It also covered missing approval, scope mismatch, a different jurisdiction, wrong intended use, a forged adapter, and a disallowed data class.
- The receipt scenario verified replay under the same approval, a same-tenant actor denial, withholding after an approval change, and withholding after facility membership revocation. Transport ran once.
- Workspace type checking, `npm run lint:gateway-boundary`, and targeted gateway test lint passed.

The feature is engineering-verified in isolated synthetic fixtures. Qualified approval of actual jurisdiction and data-class policies, privacy review, and live transport approval remain pending.

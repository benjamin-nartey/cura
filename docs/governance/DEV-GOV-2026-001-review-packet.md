# Review packet for DEV-GOV-2026-001

Status: unsigned. Phase 02 remains `IN_PROGRESS`. The exception remains `PROPOSED`. Phase 03 remains not authorized.

## Amendment

- File: `docs/constitution/amendments/DEV-GOV-2026-001.md`
- SHA-256: `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`
- Verification: `docs/governance/signatures/README.md`

## Requested authorization

Authorize synthetic-only Phase 03 engineering while Phase 02 formal acceptance stays open. The authorization does not accept Phase 02, does not approve clinical roles for real use, and does not enable production or staging break-glass.

## Architecture evidence

- Decisions ADR-0056 through ADR-0061 are in `docs/adr`.
- Foundation schema history ends at version 15 in `V16__tenancy.sql`. Chart schema head is 32. There is no Foundation V17.
- A disposable file-copy restore of a new chart database returned schema 32. The live database was not used.
- Foundation health on `127.0.0.1:8081` is checked by `npm run governance:review:dev`.

## Security evidence

- Gateway remediation and the image scan are in `docs/governance/evidence/gateway-remediation.md`.
- Image ID: `sha256:17bbfaf4d436f5133c6d40f44bbebb801d5f52024d5e2b32af0978ce691e22cb`.
- The earlier image `sha256:5861d8fe42baa3ae807d51286367059893d75a88d89c575462f120c43be60ca1` remains in `docs/governance/evidence/trivy-ai-gateway-before-runtime.json`.
- pip was removed from the runtime image. The candidate scan has no Python-package findings. Forty-four unfixed Debian highs remain.
- Disposition: `docs/governance/evidence/image-vulnerability-disposition.md`.
- Hosted CI: `docs/governance/evidence/github-actions-failure.md`. Run 38533405132 failed. The log was not readable. The workflow file now starts Dex and has not been pushed.

## Clinical development boundary

The clinical safety decision is `docs/governance/signatures/clinical-safety-decision.json`. It asks whether the development-only emergency architecture is safe and adequately restricted for development and testing.

Production and staging emergency activation are denied in code and by P02-S142 and P02-S143. Emergency elevation applies to `SyntheticRestrictedRecord` / `synthetic.read`. The requester cannot review their own access. Organization-administrator billing and audit permissions are tested by P02-S144.

## Separate clinical choices

These are not filled in:

- `docs/governance/signatures/clinical-role-matrix-decision.json` for P02-R04
- `docs/governance/signatures/clinical-emergency-policy-decision.json` for P02-R05

A deferral is valid only when the clinical reviewer writes the reason, the conditions, and the later review. Five minutes and fifteen minutes stay unapproved unless that reviewer approves them.

## Other signature records

- Architecture: `docs/governance/signatures/architecture-decision.json`
- Security: `docs/governance/signatures/security-decision.json`
- Product owner, after the three reviewer signatures: `docs/governance/signatures/product-owner-decision.json`

The product owner cannot sign the reviewer roles. One person cannot sign more than one reviewer role. The charter approval of `charter-2026.10` is not this decision.

## Expiry and revocation

If a later signature activates the exception, it ends when any of these happens:

- a reviewer or the product owner revokes it
- the signed review date is reached
- production or staging emergency elevation is no longer denied
- real patient records are introduced into the development path
- a hard-stop control in `npm run governance:review:dev` fails

Expiry does not by itself accept Phase 02 or authorize production.

## What this packet does not do

No signature field is filled. P02-R01 through P02-R06 stay `PENDING`. P03-F01 stays `NOT_STARTED`.

# P01-F04 evidence

Feature ID: P01-F04
Phase ID: 01
Feature owner and risk class: Owner role is engineering. Provisional risk class is low. This is not a production release.
Intended users and intended use: An engineer deploys and rolls back the AI gateway scaffold in a disposable local cluster. The scaffold does not diagnose.
Source v1.0 mapping and relevant ADR: Phase 01 Kubernetes, Terraform, CI, and supply-chain controls. `docs/adr/ADR-0053-delivery-skeleton.md` and `docs/adr/ADR-0051-local-stack.md`. The source docx is not in this checkout.
Inventory findings and changed files: Compose, the CI workflow, and the platform contract already existed. This feature adds the Helm chart, OpenTofu modules, deploy and rollback scripts, and the signing checks. No clinical database model was added.
Schemas/migrations and rollback evidence: No database migration. Rollback was executed, not only parsed. See the simulation lines below.
API/event contracts and request/response/error examples: `GET /health` stays status 200 with `clinicalGeneration` `refused`. A failed health check returns status 500 and does not echo the token. A dependency outage returns status 503 and does not echo the dependency address. `POST /v1/generate` stays status 403.
UI routes, accessible screenshots and every relevant UX state: Not applicable. No product screen was added.
Synthetic scenario IDs, preconditions, expected and actual oracles: SIM-01 through SIM-08 ran inside `bash infra/delivery/simulate.sh`. The kind cluster `curasphere-f04` was recreated during SIM-08 and left running. The Compose project `curasphere-local` was not stopped. Object storage put and read used the existing silo service and the text `synthetic-object`.

Executed test commands:

- `ai/gateway/.venv/Scripts/python.exe -m unittest test_app.py` exit 0. 5 passed.
- `node --test tools/platform/signing.test.mjs tools/platform/delivery-static.test.mjs` exit 0. 3 passed.
- `npm view next@15.5.27 dependencies.postcss` printed `8.4.31`.
- `npm view next version` printed `16.4.0`.
- `npm view next@16.4.0 dependencies.postcss` printed `8.5.23`.
- `bash infra/delivery/simulate.sh` exit 0.
- `docker run --rm -v //var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.58.1 image --severity HIGH,CRITICAL --quiet curasphere-ai-gateway:good` exit 0.

Simulation output that was observed:

```
source hash stable: SHA2-256(stdin)= 4ba7c9899cb4708746e380c210a3918f006aac804eb467643ae0f86deecaff82
tampered artifact rejected
object storage read back synthetic-object
image id first: sha256:ded04cd7b09b1966863225bd8c34c8a1385789a5ee729fcb6e12fadde4803573
image id second: sha256:ded04cd7b09b1966863225bd8c34c8a1385789a5ee729fcb6e12fadde4803573
invalid rollout did not become ready
rolled back dev
{"status":"ok","service":"ai-gateway","clinicalGeneration":"refused"}
missing secret failed closed
dependency outage was not ready
dependency restored
environment renders are isolated
recreated environment is ready
delivery simulations passed
```

The two image ids matched only with `docker build --provenance=false`. An earlier pair with provenance enabled produced different manifest-list ids while the image config stayed cached. The source hash above is the reproducibility identity used here because this checkout is not a git repository and has no commit SHA.

Unit/integration/contract/E2E/accessibility/load tests: The commands above were executed on this machine. No GitHub Actions run was observed. The workflow file has `permissions: contents: read` and runs the signing and delivery tests, `npm audit --audit-level=critical`, and `npm sbom --sbom-format cyclonedx`. Those hosted steps were not executed. Actions remain pinned by tag (`actions/checkout@v4`, `actions/setup-node@v4`). Cosign was not installed and no keyless signature was produced.

Auth/tenant/facility/purpose/consent/audit evidence: Dev and staging renders use different namespaces and secret names. Production Helm template, OpenTofu plan, and `deploy.sh production` fail. No tenant record was created.

Clinical and AI safety review and evidence: Generation remains status 403. No classification was marked assessed.

Observability/alert/runbook/degraded-mode and rollback evidence: `docs/platform/delivery.md`. The invalid rollout timed out, `rollback.sh dev` restored the previous revision, and health returned `clinicalGeneration` `refused`.

Reviewed approvals: None.

Residual risks, blockers and decisions: Trivy reported Debian 12.15 total 55 (high 53, critical 2) and Python packages total 3 high, 0 critical. Those image findings are not cleared. npm still has 1 high and 1 moderate in postcss 8.4.31 through next 15.5.27. next 16.4.0 would move postcss to 8.5.23 and was not installed. Branch protection was not verified. The silo service read back `synthetic-object`; it is still not the upstream MinIO image. Risk owner is the engineering role.

FINAL STATUS: ACCEPTED

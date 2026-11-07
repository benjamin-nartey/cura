# AI gateway remediation evidence

Evaluated 2026-10-14. This file records versions and scans. It does not approve Phase 02 and it does not activate `DEV-GOV-2026-001`.

## Selected versions

OSV listed no vulnerabilities for these versions on 2026-10-14:

- FastAPI 0.143.0, which requires Python >= 3.10 and Starlette >= 0.46.0
- Starlette 1.8.0, which requires Python >= 3.11
- uvicorn 0.54.0
- OpenTelemetry API, SDK, and OTLP gRPC exporter 1.45.1, required by FastAPI 0.143.0
- pip 26.2.1 inside the image

Starlette 0.41.3 was in range for these OSV records: GHSA-2c2j-9gv5-cj73 (fixed 0.47.2), GHSA-7f5h-v6xp-fcq8 / CVE-2025-62727 (fixed 0.49.1), GHSA-86qp-5c8j-p5mr / CVE-2026-48710 (fixed 1.0.1), GHSA-wqp7-x3pw-xc5r / CVE-2026-48818 (fixed 1.1.0), GHSA-x746-7m8f-x49c (fixed 1.1.0), GHSA-jp82-jpqv-5vv3 / CVE-2026-54282 (fixed 1.3.0), GHSA-82w8-qh3p-5jfq / CVE-2026-54283 (fixed 1.3.1). FastAPI's own requirement does not force Starlette 1.8.0, so `requirements.txt` pins Starlette directly.

## Commands

- `ai/gateway/.venv/Scripts/python.exe -m unittest discover -s ai/gateway -p test_*.py -v` — 7 tests, OK. `POST /v1/generate` returned HTTP 403 with `clinical-generation-refused`.
- `ai/gateway/.venv/Scripts/python.exe -m pip_audit --requirement ai/gateway/requirements.lock --no-deps --progress-spinner off` — exit 0, `No known vulnerabilities found`.
- Installed virtualenv: FastAPI 0.143.0, Starlette 1.8.0, Python 3.13.1.
- `docker build --provenance=false -t curasphere-ai-gateway:good ai/gateway` — exit 0.
- `npm run typecheck` — exit 0.
- `npm run build --workspace @curasphere/web` — exit 0.
- Disposable backup: `node --import tsx --import ./packages/domain/test/dev-env.ts tools/governance/backup-exercise.mjs` — exit 0, schema 32 restored from a file copy under the temp directory. The live `data/curasphere.sqlite` file was not used.

## Current image

The runtime image was rebuilt without pip. `apt-get upgrade` installed 0 packages. `ncurses-bin` was not removed because apt treats it as essential.

- Name: `curasphere-ai-gateway:good`
- Image ID: `sha256:17bbfaf4d436f5133c6d40f44bbebb801d5f52024d5e2b32af0978ce691e22cb`
- Previous image ID: `sha256:5861d8fe42baa3ae807d51286367059893d75a88d89c575462f120c43be60ca1`
- Candidate scan: `docs/governance/evidence/trivy-ai-gateway-candidate.json`
- Earlier scan: `docs/governance/evidence/trivy-ai-gateway-before-runtime.json`
- Container checks on port 18000: `/health` 200 with `clinicalGeneration` refused, `/ready` 200, `/metrics` 200, `POST /v1/generate` 403. A closed dependency URL returned `dependency-unavailable` and did not echo the address. User 65532. Privileged false. The container was removed after the checks.
- Installed in that image: FastAPI 0.143.0, Starlette 1.8.0. pip was not present.

## Trivy

- Scanner: aquasec/trivy 0.76.0
- Image digest of the scanner: `sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222`
- Database artifact: `mirror.gcr.io/aquasec/trivy-db:2`, downloaded for the scan
- Report time: 2026-10-14T13:01:44.202765162Z
- The JSON report does not contain a vulnerability-database updated timestamp
- Full report: `docs/governance/evidence/trivy-ai-gateway.json`
- Full-report command exit: 0, because that command did not use `--exit-code`
- Counts: critical 0, high 48, medium 60, low 61, unknown 3
- Debian 13.7 high: 44, and none of those 44 has a fixed version in the report
- Python high: 4, all inside pip 26.2.1 vendor directories (`pip/_vendor`), not application imports. OSV reported no vulnerabilities for the pip 26.2.1 package itself
- Those four are GHSA-6v7p-g79w-8964 msgpack 1.1.2 (fixed 1.2.1), CVE-2025-47273 setuptools 70.3.0 (fixed 78.1.1), CVE-2026-97687 and CVE-2026-97689 urllib3 2.7.0 (fixed 2.8.0)

The Starlette 0.41.3 findings are not present in this image scan. The Debian highs and the vendored pip findings remain open.

## Hosted CI

`gh` is not installed. The public API returned HTTP 200 for `benjamin-nartey/cura`. The only listed run is https://github.com/benjamin-nartey/cura/actions/runs/38533405132, conclusion `failure`, commit `84f0fc06044237aed8b2c98ca031f19333e3e8bb`, failed step `Run npm test`. Branch protection was not queried. This working tree was not pushed.

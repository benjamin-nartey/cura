# Hosted CI failure

Workflow: `ci`, file `.github/workflows/ci.yml`.
Run: https://github.com/benjamin-nartey/cura/actions/runs/38533405132
Run ID: `38533405132`
Commit: `84f0fc06044237aed8b2c98ca031f19333e3e8bb`
Event: push to `main`
Job: `verify` on `ubuntu-latest`
Node requested by the workflow: 22

`npm ci` succeeded. `npm test` failed. Later steps were skipped.

The log download returned HTTP 403: "Must have admin rights to Repository." `gh` is not installed. The check-run output text was empty. The exact assertion or stack trace was not retrieved.

The committed `npm test` command includes `packages/domain/test/oidc.test.ts`. Those tests call `http://127.0.0.1:15556/dex`. The workflow did not start Dex. Dex in `infra/local/compose.yaml` does not depend on Postgres. The local issuer answered HTTP 200 during this investigation because a local Dex container was already running. That does not reproduce the hosted runner.

The workflow now starts Dex and waits for its discovery document before `npm test`. That change is local. It was not pushed, and the hosted run was not repeated. Hosted CI for this working tree stays `NOT_VERIFIED`. Re-running the workflow requires permission to push or to re-run Actions, plus repository access to read the log if it fails again.

The failed run does not include the uncommitted gateway or governance changes. Local `npm test` is not evidence that the hosted job has passed.

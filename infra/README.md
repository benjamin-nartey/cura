# Infrastructure

This directory is the home for local and deployment infrastructure. `bash infra/local/up.sh` starts the local stack. `bash infra/delivery/simulate.sh` runs the disposable kind, Helm, and OpenTofu checks. No production secret or patient record belongs here. The local credential is `local-test-only`. Production deployment is refused.

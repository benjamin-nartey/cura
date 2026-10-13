#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
node --test tools/platform/contract-compat.test.mjs
node --check tools/platform/contract-compat.mjs
node --check tools/platform/contract-compat.test.mjs

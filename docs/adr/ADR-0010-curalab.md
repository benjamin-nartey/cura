# ADR-0010: Critical lab flags are a pinned rule

Status: Accepted
Date: 2026-10-08

## Context
Phase 14 asks for laboratory orders, specimens, results, reference ranges, a critical-result workflow, a trend engine, and an explanation layer. This slice has no analyzer and no allowlisted model. A fabricated narrative or a model that clears an alert would be a production mock.

## Decision
Orders move from requested to collected to resulted as committed rows. The result copies the facility catalog unit, reference range, and code-system versions onto the result row, and it also writes a source observation. Critical status is computed from `lab-critical-2026.10` (potassium 2.5/6.0, glucose 40/500). A missing rule is not critical. An open alert is inserted with a critical result. Acknowledgement does not clear the flag. The trend sentence compares the last two stored results. Any explanation that needs a model goes through the gateway, which refuses clinical generation. The stored explanation is the deterministic sentence. Gateway output is not written onto the result, and `holdCriticalFlag` ignores a model payload.

## Consequences
Schema version 10 adds the lab tables. Rollback is to stop the app and delete `data/curasphere.sqlite`. The critical bounds are a local pin, not a universal clinical standard.

## Revisit trigger
A reviewed laboratory interface and an allowlisted model exist. A model may add a cited sentence only after the gateway accepts it, and it still cannot set `critical_flag` to `none`.

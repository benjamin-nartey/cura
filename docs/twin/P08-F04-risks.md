# P08-F04 risks and controls

- False clinical freshness: budgets are background verification periods only; preserve original clinical/source times and unknown clock, no therapy/risk inference or expiry of clinical assertions.
- Stale/corrupt cache: source-authorized reproduction, explicit stale/corrupt/unverified/overdue states; no cached clinical values in operations metadata; append derived repair and checkpoint only after current-source match.
- Changed source between stages: re-read source at prepare and completion, exact prepared build match, no stale certificate; failed phase retained and explicit retry.
- Partial failure: build commit and checkpoint success distinct; immutable progress and result pointer retained, no partial clinical model or fake success. Retry reuses valid existing build.
- Lost/replayed authority: worker obtains live identity and current purpose/facility/coverage at execution, no saved authority token in jobs. Owner-scoped jobs cannot operate another reader's materialization.
- Crash/concurrency/cancel: transactional claims, unique active scope,60-second fenced leases, three attempts, immutable transition evidence; old/cancelled workers cannot complete.
- Duplicate commands/capacity: idempotency binds action/job/source context; real100-job/200-receipt retention tests; no automatic deletion or receipt reset.
- Network/context failure: browser reads serialized; source/authority uncertainty redacts cached Twin views; opt-in bounded read observation stops offline, no command replay.
- Operational dead worker: persisted queued/running state is honest, never timer-generated success; watcher failure/exit must be monitored and authority renewed. Default local watcher consumes explicit requests only; optional due scheduling remains bounded and gated.

Residual limits: browser serialization does not certify multi-user production throughput. Source inventory/build quotas still apply; checkpoint success certifies source reproduction, not clinical safety or external-feed completeness. Worker runs for a supplied live owner/patient context; deployment service identity, scheduling, retention and clinical freshness policy require qualified review. Formal acceptance remains pending, production clinical functions disabled, F05 unstarted.

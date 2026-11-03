# Engineering phase progression

Status: implemented parallel progression rules; formal phase acceptance is unchanged.

The runner reads the original masterplan and the v2 dependency graph, not a guessed next phase. It uses historical experimental completion as a dependency baseline and requires current regression gates. It does not relabel historical completion as v2 automated acceptance. A failed earlier mandatory dependency gate blocks advancement.

Exactly one feature is active. After all mandatory applicable technical gates pass on stable source, the feature is ENGINEERING_ACCEPTED and the next authorized dependency-ready engineering feature is selected automatically. Unrelated historical pending reviews do not block this local track. Unknown classifications, missing evidence, failures and out-of-scope work stop the runner. Resuming reruns current evidence; a stale index cannot authorize work.

The Product Owner request authorizes GOV-V2-MIGRATION and P04-F05 and preparation of a Phase 05 plan. It does not authorize Phase 05 implementation. The runner stops with AUTHORIZED_SCOPE_COMPLETE after the two scoped assessments and permits no feature outside that list. Future multi-feature engineering scopes may progress automatically without per-feature signatures, but authority to use real data or deploy does not follow from engineering scope.

Formal Phase 02 stays IN_PROGRESS, original Phase 03 stays NOT_AUTHORIZED, formal Phase 04 stays NOT_STARTED, DEV-GOV-2026-001 stays PROPOSED, and P02-R01 through P02-R06 remain PENDING. Formal reconciliation requires its authorized process and never rewrites historical meaning.

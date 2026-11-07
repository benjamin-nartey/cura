# P11-F05 Run visibility and safety

The Agents workspace shows the run status, execution attempt count, and up to eight checkpoint entries. Each entry shows the tool, checkpoint status, and recorded time. The trace reads only checkpoint metadata. Source identifiers continue to use the existing patient-relationship check.

The reviewer sees the consequence of each choice before submitting it. Approval completes the review record. Decline closes the review. Neither decision changes the chart or starts a model.

Schema 63 adds one execution control per organization. An active organization administrator with no facility assignment can stop or enable execution in the local synthetic workspace. Stop and the closure of running jobs commit together. Workers recheck run state before advancing each checkpoint. New submissions and approval grants are blocked while stopped. Parked reviews remain visible and may be declined. Re-enabling execution permits new work and leaves stopped runs terminal. Control changes and affected runs produce audit events. The existing owner-only cancellation remains available for active Temporal runs.

Rollback uses a pre-migration database backup with its matching build. Formal acceptance and hosted operations review remain pending.

The full domain suite passed all 661 tests. The stop regression verified role enforcement, a stopped run that stays closed after re-enabling, rejection of new runs and approvals while stopped, and a successful decline. Web type checking and gateway boundary lint passed.

A signed-in Playwright check used a disposable database upgraded from schema 62. An administrator stopped execution, a second reviewer saw the trace and decision consequences, and the reviewer declined with approval disabled. The administrator then re-enabled execution. Logs and a screenshot are in `artifacts/governance-v2/P11-F05`.

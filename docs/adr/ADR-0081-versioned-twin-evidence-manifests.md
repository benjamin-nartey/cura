# ADR-0081 — Patient Twin versioned evidence manifests

Status: locally implemented and engineering-verified; qualified review pending.

Keep the legacy patient-state API/build contract intact. New schema 54 stores immutable pointer-only twin manifests in separate tables because mixing contracts in patient_state_builds could break legacy readers. Reuse clinical source history and work_versions, with authorized source readers on every capture/read/inspection. Versioned facts retain recorded statuses; do not label drafts active therapies or infer care gaps/risk. F01 establishes source representation; F02 later adds projection predicates.

Manifests bind owner, tenant/facility, treatment purpose and exact permitted coverage; immutable membership count/hash prevents partial or tampered evidence from appearing complete. Capture is bounded/idempotent/transactional. Fresh reads require exact current source hash; stale clinical facts are withheld. A selected exact historic source remains inspectable only after membership and current authorization checks. No source mutations or autonomous clinical actions.

No offline facts or automatic capture/replay. Errors clear clinical data and require explicit refresh. Keep local retention bounded without deleting evidence; genuine deployment retention and clinical/architecture/privacy/licensing acceptance remain qualified work. No Phase 08 projector/conflict/refresh engine is preemptively implemented.

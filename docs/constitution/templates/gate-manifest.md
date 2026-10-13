# Gate manifest template

- Feature id:
- Owner role:
- Intended user:
- Intended use:
- Risk class:
- Workflow class: administrative or clinical-impact
- Tests:
- Rollback:
- Audit:
- Change control: version, reason, author role
- Surveillance: what is watched, owner role, and `completedStudy: null` until a study exists
- Clinical sign-off: required for clinical-impact, with a name and a date
- Break-glass: reason, scope, expiry, and a named approver, or null

An empty test list, a missing rollback, a clinical-impact item without a named sign-off, or a break-glass review without an approver is rejected.

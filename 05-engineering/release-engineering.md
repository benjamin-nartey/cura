# Release Engineering

Trunk-based development with short-lived branches, protected main, required reviews, signed artifacts, SBOM, provenance, automated test gates and GitOps deployment. Use feature flags to separate deployment from release.

Database migrations follow expand/migrate/contract. Destructive migrations require data backup, compatibility window and explicit rollback/restore plan.

Clinical AI releases have an independent release checklist and may remain in shadow mode after software deployment.

# Implementation Policy and Source-of-Truth Precedence

1. `source/CuraSphere_Engineering_Specification_Pack_v1.0.docx`: authoritative CuraSphere vision, safety principles, architecture baseline, phases 00–30, scope, exit criteria and §13 protocol.
2. `AGENTS.md` and `.cursor/rules/curasphere.mdc`: binding execution behavior and stop rules in this working repo.
3. `phase-specs/PHASE_XX_*.md`: **derived engineering elaborations**, proposals for data models, API surface, UI states, fixtures and tests. They are actionable defaults but *not* source-approved decisions. Resolve conflicts in favor of source; log decisions in ADRs.
4. `docs/SYNTHETIC_SCENARIOS.md` and `fixtures/`: synthetic test fixtures, not real clinical reference ranges, approved care guidance or regulatory evidence.
5. Actual repository contracts and migrations: inspect before changes. Preserve legitimate prior completed behavior; propose RFC/ADR for changes.

**Unresolved decisions requiring explicit approval**: first production jurisdiction, intended-use/regulated classification per capability, live medical safety thresholds, clinical protocols, country-specific privacy/retention/legal requirements, terminology licenses, production provider PHI agreements, insurance/payment integration contracts, all clinician signoffs. Assume none of these is already granted. An agent may implement gated configuration and test-only behavior without asserting production readiness.

**Do not silently fill source gaps:** choices in this pack (sample endpoints, schema names, initial locales, demo facts, UI routes and metrics) are implementation proposals and must be confirmed against repo before implementation. Do not present as quotation from original specification.

**Source phase gates**: preserve each phase's source scope and source exit criteria exactly as extracted in its phase file. The high-level document does not define every field/endpoint or clinical rule: this pack proposes those details. **Do not overwrite real accepted business/regulatory decisions with fixture assumptions.**

**Feature acceptance**: Every applicable section must pass: code/reviews, migrations/seed, API/events, web/mobile (or explicitly N/A), loading/empty/error/conflict/offline states, accessibility, auth/tenant/consent, audit, data integrity, simulation oracles, automated tests, SLO/degraded state, runbook, rollback and documentation. Human approval is never simulated.

**Start gate**: Phase 00 is documentation only, as explicitly required. No executable product code before it is accepted.
